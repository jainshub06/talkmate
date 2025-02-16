'use client'
import React, { useState, useEffect } from "react";
import io from "socket.io-client";

const socket = io("http://localhost:5000");

async function generateKeyPair(): Promise<CryptoKeyPair> {
    return await window.crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey"]
    );
}

async function deriveSharedSecret(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
    return await window.crypto.subtle.deriveKey(
        { name: "ECDH", public: publicKey },
        privateKey,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

function ChatApp() {
    const [userId, setUserId] = useState<string>("");
    const [recipientId, setRecipientId] = useState<string>("");
    const [message, setMessage] = useState<string>("");
    const [messages, setMessages] = useState<{ sender: string; text: string; image?: string; video?: string }[]>([]);
    const [sharedKey, setSharedKey] = useState<CryptoKey | null>(null);
    const [isRegistered, setIsRegistered] = useState<boolean>(false);
    const [media, setMedia] = useState<File | null>(null);

    useEffect(() => {
        async function setupEncryption() {
            const aliceKeys = await generateKeyPair();
            const bobKeys = await generateKeyPair();
            const shared = await deriveSharedSecret(aliceKeys.privateKey, bobKeys.publicKey);
            setSharedKey(shared);
        }
        setupEncryption();
    }, []);

    useEffect(() => {
        socket.on("private-message", async ({ sender, encryptedMsg, image, video }) => {
            if (!sharedKey) return;
            const decryptedMessage = encryptedMsg ? await decryptMessage(encryptedMsg.data, encryptedMsg.iv) : "";
            setMessages((prevMessages: any) => [...prevMessages, { sender, text: decryptedMessage, image, video }]);
        });
        return () => {
            socket.off("private-message");
        };
    }, [sharedKey]);

    function registerUser() {
        if (userId) {
            socket.emit("register", userId);
            setIsRegistered(true);
        }
    }

    async function sendMessage() {
        if (!sharedKey || !userId || !recipientId) return;
        if (!message.trim() && !media) return; // Prevent sending empty messages
        
        let encryptedMsg = null;
        if (message) {
            const encoder = new TextEncoder();
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const encrypted = await window.crypto.subtle.encrypt(
                { name: "AES-GCM", iv },
                sharedKey,
                encoder.encode(message)
            );
            encryptedMsg = { data: new Uint8Array(encrypted), iv };
        }
        let image: any = null, video: any = null;
        if (media) {
            const reader = new FileReader();
            reader.readAsDataURL(media);
            reader.onloadend = () => {
                const base64Data = reader.result;
                if (media.type.startsWith("image")) {
                    image = base64Data;
                } else if (media.type.startsWith("video")) {
                    video = base64Data;
                }
                socket.emit("private-message", { sender: userId, recipient: recipientId, encryptedMsg, image, video });
                setMessages([...messages, { sender: "You", text: message, image, video }]);
                setMessage("");
                setMedia(null);
            };
        } else {
            socket.emit("private-message", { sender: userId, recipient: recipientId, encryptedMsg });
            setMessages([...messages, { sender: "You", text: message }]);
            setMessage("");
        }
    }

    async function decryptMessage(encryptedData: Uint8Array, iv: Uint8Array): Promise<string | void> {
        if (!sharedKey) return;
        const decrypted = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            sharedKey,
            encryptedData
        );
        return new TextDecoder().decode(decrypted);
    }

    function handleMediaChange(event: React.ChangeEvent<HTMLInputElement>) {
        if (event.target.files) {
            setMedia(event.target.files[0]);
        }
    }

    if (!isRegistered) {
        return (
            <div style={{ padding: "20px", maxWidth: "400px", margin: "auto" }}>
                <h2>Register</h2>
                <input
                    type="text"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="Enter your User ID"
                    style={{ width: "100%", padding: "10px", marginBottom: "10px" }}
                />
                <button onClick={registerUser} style={{ marginBottom: "10px" }}>Register</button>
            </div>
        );
    }

    return (
        <div style={{ padding: "20px", maxWidth: "400px", margin: "auto" }}>
            <h2>Secure Chat</h2>
            <input
                type="text"
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                placeholder="Recipient User ID"
                style={{ width: "100%", padding: "10px", marginBottom: "10px" }}
            />
            <div style={{ maxHeight: "400px", overflowY: "auto", border: "1px solid #ccc", padding: "10px", marginBottom: "10px" }}>
            {messages.map((msg, index) => (
              <div key={index} style={{ marginBottom: "10px", padding: "5px", borderRadius: "5px", backgroundColor: msg.sender === "You" ? "#d1e7dd" : "#f8d7da" }}>
              <strong>{msg.sender}:</strong> {msg.text}
              {msg.image && <img src={msg.image} alt="Sent" style={{ width: "100px", display: "block", marginTop: "5px" }} />}
              {msg.video && <video src={msg.video} controls style={{ width: "100px", display: "block", marginTop: "5px" }} />}
              </div>
            ))}
            </div>
            <input type="file" accept="image/*,video/*" capture="environment" onChange={handleMediaChange} style={{ marginTop: "10px" }} />
            <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type a message"
                style={{ width: "100%", padding: "10px", marginTop: "10px" }}
            />
            <button onClick={sendMessage} style={{ marginTop: "10px" }}>Send</button>
        </div>
    );
}

export default ChatApp;

