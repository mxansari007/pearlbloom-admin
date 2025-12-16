import { useEffect, useRef, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useParams } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import AdminLayout from "../layouts/AdminLayout";

type Message = {
  sender: "user" | "admin";
  text: string;
  createdAt?: Timestamp;
};

type ChatUser = {
  name: string;
  phone: string;
};

export default function ChatDetailPage() {
  const { chatId } = useParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [user, setUser] = useState<ChatUser>({
    name: "Guest User",
    phone: "Phone not shared",
  });

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const firstLoadRef = useRef(true);

  /* ---------------- Realtime chat doc (USER INFO) ---------------- */

  useEffect(() => {
    if (!chatId) return;

    const chatRef = doc(db, "chats", chatId);

    const unsub = onSnapshot(chatRef, (snap) => {
      if (!snap.exists()) return;

      const data = snap.data();

      setUser({
        name: data.user?.name?.trim() || "Guest User",
        phone: data.user?.phone?.trim() || "Phone not shared",
      });

      // mark chat as read
      setDoc(
        chatRef,
        { lastSender: "admin" },
        { merge: true }
      );
    });

    return unsub;
  }, [chatId]);

  /* ---------------- Realtime messages ---------------- */

  useEffect(() => {
    if (!chatId) return;

    const q = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt")
    );

    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => d.data() as Message));
    });
  }, [chatId]);

  /* ---------------- Auto scroll ---------------- */

  useEffect(() => {
    if (!bottomRef.current) return;

    if (firstLoadRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "auto" });
      firstLoadRef.current = false;
    } else {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  /* ---------------- Send admin reply ---------------- */

  const send = async () => {
    if (!input.trim() || !chatId) return;

    const text = input.trim();
    setInput("");

    await addDoc(collection(db, "chats", chatId, "messages"), {
      sender: "admin",
      text,
      createdAt: serverTimestamp(),
    });

    await setDoc(
      doc(db, "chats", chatId),
      {
        lastMessage: text,
        lastMessageAt: serverTimestamp(),
        lastSender: "admin",
      },
      { merge: true }
    );
  };

  return (
    <ProtectedRoute>
      <AdminLayout title="Chat">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* USER INFO */}
          <div className="border border-white/10 rounded-lg p-4 bg-neutral-900">
            <p className="text-xs text-neutral-400 uppercase tracking-wide">
              Customer
            </p>

            <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="font-medium">{user.name}</p>
                <p className="text-sm text-neutral-400">{user.phone}</p>
              </div>

              <p className="text-xs text-neutral-500">
                Chat ID: {chatId}
              </p>
            </div>
          </div>

          {/* MESSAGES */}
          <div className="h-[60vh] overflow-y-auto space-y-3 border border-white/10 p-4 rounded bg-neutral-900">
            {messages.map((m, i) => {
              const isAdmin = m.sender === "admin";

              return (
                <div
                  key={i}
                  className={`flex ${
                    isAdmin ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`
                      max-w-[75%] px-3 py-2 text-sm rounded-2xl
                      ${
                        isAdmin
                          ? "bg-yellow-500 text-black rounded-br-sm"
                          : "bg-neutral-800 text-neutral-200 rounded-bl-sm"
                      }
                    `}
                  >
                    {m.text}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* INPUT */}
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 bg-neutral-800 px-3 py-2 rounded"
              placeholder="Reply..."
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <button
              onClick={send}
              className="bg-yellow-500 text-black px-4 rounded font-medium"
            >
              Send
            </button>
          </div>
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
