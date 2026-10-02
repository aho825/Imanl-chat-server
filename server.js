const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8080;
const DATA_FILE = path.join(__dirname, "messages.json");
const MAX_MESSAGES = 2000;

// =========================
// MESAJ GEÇMİŞİNİ YÜKLE
// =========================

let messages = [];

try {
    if (fs.existsSync(DATA_FILE)) {
        const data = fs.readFileSync(DATA_FILE, "utf8");
        messages = JSON.parse(data);

        if (!Array.isArray(messages)) {
            messages = [];
        }
    }
} catch (err) {
    console.log("Mesaj geçmişi okunamadı, boş başlatılıyor.");
    messages = [];
}

// =========================
// KÜFÜR FİLTRESİ
// =========================

const bannedWords = [
    "amk",
    "aq",
    "amq",
    "siktir",
    "sik",
    "yarrak",
    "orospu",
    "piç",
    "salak",
    "gerizekalı",
    "ananı",
    "anan",

    "purna",
    "porno",
    "pirno",
    "poyno",
    "pirna",
    "pilna",
    "purno",
    "pirnu"
];

function censorText(text) {
    let result = text;

    for (const word of bannedWords) {
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escaped, "gi");

        result = result.replace(regex, "*".repeat(word.length));
    }

    return result;
}

// =========================
// DOSYAYA KAYDET
// =========================

function saveMessages() {
    try {
        const tempFile = DATA_FILE + ".tmp";

        fs.writeFileSync(
            tempFile,
            JSON.stringify(messages, null, 2),
            "utf8"
        );

        fs.renameSync(tempFile, DATA_FILE);
    } catch (err) {
        console.log("Mesajlar kaydedilemedi:", err.message);
    }
}

// =========================
// HTTP SUNUCUSU
// =========================

const server = http.createServer((req, res) => {

    if (req.url === "/health") {
        res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8"
        });

        res.end("İmanlı Chat sunucusu aktif.");
        return;
    }

    res.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8"
    });

    res.end("Not Found");
});

// =========================
// WEBSOCKET SUNUCUSU
// =========================

const wss = new WebSocketServer({
    server: server
});

// Her bağlantının kullanıcı adı
const clients = new Map();

// =========================
// YARDIMCI FONKSİYONLAR
// =========================

function send(ws, data) {
    if (ws.readyState === 1) {
        ws.send(JSON.stringify(data));
    }
}

function broadcast(data) {
    const message = JSON.stringify(data);

    for (const client of wss.clients) {
        if (client.readyState === 1) {
            client.send(message);
        }
    }
}

function cleanUsername(username) {
    username = String(username || "Misafir");

    username = username
        .replace(/[\r\n\t]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (!username) {
        username = "Misafir";
    }

    if (username.length > 20) {
        username = username.substring(0, 20);
    }

    return username;
}

function getActiveUsers() {
    const users = [];

    for (const username of clients.values()) {
        if (username && !users.includes(username)) {
            users.push(username);
        }
    }

    return users;
}

function updateUsers() {
    broadcast({
        type: "users",
        users: getActiveUsers()
    });
}

// =========================
// YENİ BAĞLANTI
// =========================

wss.on("connection", (ws) => {

    console.log("Yeni bağlantı.");

    clients.set(ws, "Misafir");

    // Eski mesajları gönder
    send(ws, {
        type: "history",
        messages: messages
    });

    updateUsers();

    // =========================
    // MESAJ GELDİ
    // =========================

    ws.on("message", (raw) => {

        let data;

        try {
            data = JSON.parse(raw.toString());
        } catch (err) {
            return;
        }

        // =========================
        // KULLANICI ADI
        // =========================

        if (data.type === "login") {

            const username = cleanUsername(data.username);

            clients.set(ws, username);

            console.log(username + " bağlandı.");

            updateUsers();

            return;
        }

        // =========================
        // MESAJ
        // =========================

        if (data.type === "message") {

            let username = clients.get(ws) || "Misafir";

            let text = String(data.text || "");

            text = text
                .replace(/[\r\n\t]/g, " ")
                .replace(/\s+/g, " ")
                .trim();

            // Boş mesaj gönderme
            if (!text) {
                return;
            }

            // Çok uzun mesajları kes
            if (text.length > 1000) {
                text = text.substring(0, 1000);
            }

            // Küfür filtresi
            text = censorText(text);

            const now = new Date();

            const message = {
                username: username,
                text: text,
                time: now.toLocaleTimeString("tr-TR", {
                    hour: "2-digit",
                    minute: "2-digit"
                }),
                timestamp: Date.now()
            };

            // Geçmişe ekle
            messages.push(message);

            // En fazla 2000 mesaj tut
            if (messages.length > MAX_MESSAGES) {
                messages = messages.slice(-MAX_MESSAGES);
            }

            // Kalıcı olarak kaydet
            saveMessages();

            // Herkese gönder
            broadcast({
                type: "message",
                username: message.username,
                text: message.text,
                time: message.time
            });

            console.log(
                "[" + message.time + "] " +
                username + ": " +
                text
            );
        }
    });

    // =========================
    // BAĞLANTI KAPANDI
    // =========================

    ws.on("close", () => {

        const username = clients.get(ws) || "Misafir";

        console.log(username + " ayrıldı.");

        clients.delete(ws);

        updateUsers();
    });

    ws.on("error", () => {
        clients.delete(ws);
        updateUsers();
    });
});

// =========================
// SUNUCUYU BAŞLAT
// =========================

server.listen(PORT, "0.0.0.0", () => {

    console.log("--------------------------------");
    console.log("İMANLI CHAT SUNUCUSU AKTİF");
    console.log("Port: " + PORT);
    console.log("Mesaj sayısı: " + messages.length);
    console.log("--------------------------------");
});
