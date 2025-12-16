import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import AdminLayout from "../layouts/AdminLayout";

type Chat = {
  id: string;
  user?: {
    name?: string;
    phone?: string;
  };
  lastMessage?: string;
  lastSender?: "user" | "admin";
  lastMessageAt?: Timestamp;
};

export default function ChatsPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const q = query(
      collection(db, "chats"),
      orderBy("lastMessageAt", "desc")
    );

    return onSnapshot(q, (snap) => {
      setChats(
        snap.docs.map((d) => ({
          ...(d.data() as Chat),
          id: d.id, // ✅ correct order (no TS warning)
        }))
      );
    });
  }, []);

  return (
    <ProtectedRoute>
      <AdminLayout title="Chats" subtitle="Explore your customer conversations">
        <div className="space-y-3">
          {chats.length === 0 ? (
            <div className="text-sm text-neutral-400 text-center py-12">
              No chats yet.
            </div>
          ) : (
            chats.map((c) => {
              const unread = c.lastSender === "user";

              return (
                <div
                  key={c.id}
                  onClick={() => navigate(`/chats/${c.id}`)}
                  className={`
                    p-4 rounded-lg cursor-pointer transition border
                    ${
                      unread
                        ? "bg-neutral-900 border-yellow-500/60"
                        : "bg-neutral-900 border-white/10"
                    }
                    hover:border-yellow-500/40
                  `}
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-sm">
                      {c.user?.name || "Unknown user"}
                    </div>

                    {unread && (
                      <span className="text-[10px] bg-yellow-500 text-black px-2 py-[1px] rounded-full">
                        New
                      </span>
                    )}
                  </div>

                  {/* Bubble-style message preview */}
                  <div className="flex">
                    <div
                      className={`
                        max-w-[85%] px-3 py-2 text-sm rounded-2xl truncate
                        ${
                          unread
                            ? "bg-yellow-500/20 text-yellow-200 rounded-bl-sm"
                            : "bg-neutral-800 text-neutral-300 rounded-bl-sm"
                        }
                      `}
                    >
                      {c.lastMessage || "No messages yet"}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
