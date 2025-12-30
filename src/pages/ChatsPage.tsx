import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";
import AdminLayout from "../layouts/AdminLayout";

type Chat = {
  id: string;
  userId?: string;
  user?: {
    name?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
  };
  lastMessage?: string;
  lastSender?: "user" | "admin";
  lastMessageAt?: Timestamp;
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

  const navigateToUser = async (e: React.MouseEvent, c: Chat) => {
    e.stopPropagation();
    const directUserId =
      c.userId ||
      (typeof (c as any)?.uid === "string" ? (c as any).uid : undefined) ||
      (typeof (c as any)?.user?.id === "string" ? (c as any).user.id : undefined);

    if (directUserId) {
      navigate(`/users/${directUserId}`);
      return;
    }

    const phone = typeof c.user?.phone === "string" ? c.user.phone : undefined;
    if (!phone) {
      navigate("/users");
      return;
    }

    try {
      const uSnaps = await getDocs(
        query(collection(db, "users"), where("phone", "==", phone))
      );
      const docId = uSnaps.docs[0]?.id;
      if (docId) {
        navigate(`/users/${docId}`);
      } else {
        navigate("/users");
      }
    } catch {
      navigate("/users");
    }
  };

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
              const name = composeName(c.user) || "Unknown user";

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
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{name}</div>
                      <div className="text-[11px] text-neutral-500 truncate">
                        {c.user?.phone || c.user?.email || "—"}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => navigateToUser(e, c)}
                        className="text-[11px] rounded-full border border-neutral-700 px-3 py-1.5 text-neutral-200 hover:bg-neutral-900 transition"
                      >
                        View user
                      </button>
                      {unread && (
                        <span className="text-[10px] bg-yellow-500 text-black px-2 py-[1px] rounded-full">
                          New
                        </span>
                      )}
                    </div>
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
