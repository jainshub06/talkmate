const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

const users = {};

io.on("connection", (socket) => {
    console.log("A user connected", socket.id);

    socket.on("register", (userId) => {
        users[userId] = socket.id;
        console.log(`User registered: ${userId}`);
    });

    socket.on("private-message", ({ sender, recipient, encryptedMsg, image, video }) => {
        const recipientSocketId = users[recipient];
        if (recipientSocketId) {
            io.to(recipientSocketId).emit("private-message", { sender, encryptedMsg, image, video });
        }
    });

    socket.on("disconnect", () => {
        console.log("User disconnected", socket.id);
        for (let user in users) {
            if (users[user] === socket.id) {
                delete users[user];
                break;
            }
        }
    });
});

server.listen(5000, () => {
    console.log("Server is running on port 5000");
});
