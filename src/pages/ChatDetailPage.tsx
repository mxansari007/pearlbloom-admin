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
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebase";
import { Link, useParams } from "react-router-dom";
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
  userId?: string;
};

const composeName = (obj: any): string | undefined => {
  const raw = typeof obj?.name === "string" ? obj.name : undefined;
  const fn =
    obj?.firstName ?? obj?.firstname ?? obj?.userFirstName ?? obj?.userFirstname;
  const ln =
    obj?.lastName ?? obj?.lastname ?? obj?.userLastName ?? obj?.userLastname;
  const combined = [fn, ln].filter(Boolean).join(" ").trim();
  const finalName = (raw && raw.trim().length ? raw : combined) || undefined;
  return finalName && finalName.trim().length ? finalName : undefined;
};

const MessageBubbleSkeleton = ({ isAdmin }: { isAdmin: boolean }) => (
  <div className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
    <div
      className={`
        max-w-[55%] h-10 px-3 py-2 text-sm rounded-2xl animate-pulse
        ${
          isAdmin
            ? "bg-neutral-700 rounded-br-sm"
            : "bg-neutral-800 rounded-bl-sm"
        }
      `}
    />
  </div>
);

export default function ChatDetailPage() {
  const { chatId } = useParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [user, setUser] = useState<ChatUser>({
    name: "Guest User",
    phone: "Phone not shared",
    userId: undefined,
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
      const uid =
        (typeof (data as any)?.userId === "string" ? (data as any).userId : undefined) ||
        (typeof (data as any)?.uid === "string" ? (data as any).uid : undefined) ||
        (typeof (data as any)?.user?.id === "string" ? (data as any).user.id : undefined);
      const phone =
        (typeof (data as any)?.user?.phone === "string" ? (data as any).user.phone : undefined) ||
        (typeof (data as any)?.phone === "string" ? (data as any).phone : undefined) ||
        (typeof (data as any)?.userPhone === "string" ? (data as any).userPhone : undefined) ||
        "Phone not shared";

      setUser({
        name: (composeName(data.user) || "Guest User").trim(),
        phone: String(phone).trim(),
        userId: uid,
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

  useEffect(() => {
    (async () => {
      if (!chatId) return;
      if (user.userId) return;
      const phone = user.phone && user.phone !== "Phone not shared" ? user.phone : undefined;
      if (!phone) return;
      try {
        const uSnaps = await getDocs(
          query(collection(db, "users"), where("phone", "==", phone))
        );
        const docId = uSnaps.docs[0]?.id;
        if (docId) {
          setUser((prev) => ({ ...prev, userId: docId }));
        }
      } catch {}
    })();
  }, [chatId, user.phone, user.userId]);

  /* ---------------- Realtime messages ---------------- */

  useEffect(() => {
    if (!chatId) return;

    const q = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt")
    );

    let initialLoad = true;
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => d.data() as Message));
      if (initialLoad) {
        setLoading(false);
        initialLoad = false;
      }
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

  const initials = user.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <ProtectedRoute>
      <AdminLayout 
        title="Chat"
        actions={
          <Link
            to="/chats"
            className="text-[11px] rounded-xl border border-neutral-700 px-3 py-1.5 text-neutral-300 hover:bg-neutral-800 transition"
          >
            ← Back to chats
          </Link>
        }
      >
        <div className="max-w-4xl mx-auto space-y-4">
          {/* USER INFO */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-500/20 to-amber-500/10 border border-yellow-500/30 flex items-center justify-center text-sm font-semibold text-yellow-300">
                  {initials || "?"}
                </div>
                <div>
                  <p className="font-semibold text-neutral-100">{user.name}</p>
                  <p className="text-sm text-neutral-400">{user.phone}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {user.userId && (
                  <Link
                    to={`/users/${user.userId}`}
                    className="text-[11px] rounded-xl border border-yellow-500/40 px-3 py-1.5 text-yellow-200 hover:bg-yellow-500/10 transition font-medium"
                  >
                    👤 View profile
                  </Link>
                )}
                <span className="text-[10px] text-neutral-600 bg-neutral-800 px-2 py-1 rounded font-mono">
                  ID: {chatId?.slice(0, 8)}...
                </span>
              </div>
            </div>
          </div>

          {/* MESSAGES */}
          <div className="h-[55vh] sm:h-[60vh] overflow-y-auto space-y-3 rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 sm:p-5">
            {loading ? (
              <>
                <MessageBubbleSkeleton isAdmin={false} />
                <MessageBubbleSkeleton isAdmin={true} />
                <MessageBubbleSkeleton isAdmin={false} />
                <MessageBubbleSkeleton isAdmin={false} />
                <MessageBubbleSkeleton isAdmin={true} />
              </>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="text-4xl mb-3 opacity-40">💬</div>
                <p className="text-sm text-neutral-400">No messages yet</p>
                <p className="text-xs text-neutral-500 mt-1">Send a message to start the conversation</p>
              </div>
            ) : (
              messages.map((m, i) => {
                const isAdmin = m.sender === "admin";
                const time = m.createdAt?.toDate?.().toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                }) || "";

                return (
                  <div
                    key={i}
                    className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}
                  >
                    <div className={`max-w-[80%] sm:max-w-[70%] ${isAdmin ? "text-right" : "text-left"}`}>
                      <div
                        className={`
                          inline-block px-4 py-2.5 text-sm rounded-2xl leading-relaxed
                          ${
                            isAdmin
                              ? "bg-gradient-to-r from-yellow-500 to-amber-500 text-black rounded-br-sm"
                              : "bg-neutral-800/80 text-neutral-200 rounded-bl-sm border border-neutral-700/50"
                          }
                        `}
                      >
                        {m.text}
                      </div>
                      {time && (
                        <p className={`text-[10px] text-neutral-500 mt-1 ${isAdmin ? "text-right pr-1" : "text-left pl-1"}`}>
                          {time}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* INPUT */}
          <div className="flex gap-2 sm:gap-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 bg-neutral-900/60 border border-neutral-700 px-4 py-3 rounded-xl text-sm placeholder:text-neutral-500 focus:outline-none focus:border-yellow-500/50 transition"
              placeholder="Type your reply..."
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <button
              onClick={send}
              disabled={!input.trim()}
              className="bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black px-5 sm:px-6 rounded-xl font-semibold text-sm disabled:opacity-50 transition-all shadow-lg shadow-yellow-500/20 disabled:shadow-none"
            >
              Send →
            </button>
          </div>
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
