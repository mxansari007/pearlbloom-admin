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

const ChatRowSkeleton = () => (
  <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950/60 animate-pulse">
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-neutral-700"></div>
        <div>
          <div className="h-4 bg-neutral-700 rounded w-28 mb-2"></div>
          <div className="h-3 bg-neutral-700 rounded w-20"></div>
        </div>
      </div>
      <div className="h-7 w-16 bg-neutral-700 rounded-full"></div>
    </div>
    <div className="pl-13">
      <div className="h-8 w-3/4 bg-neutral-800 rounded-2xl"></div>
    </div>
  </div>
);

export default function ChatsPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const q = query(
      collection(db, "chats"),
      orderBy("lastMessageAt", "desc")
    );

    let initialLoad = true;
    return onSnapshot(q, (snap) => {
      setChats(
        snap.docs.map((d) => ({
          ...(d.data() as Chat),
          id: d.id,
        }))
      );
      if (initialLoad) {
        setLoading(false);
        initialLoad = false;
      }
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
      <AdminLayout title="Chats" subtitle="Customer conversations">
        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <ChatRowSkeleton key={i} />)
          ) : chats.length === 0 ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-12 text-center">
              <div className="text-4xl mb-3 opacity-40">💬</div>
              <p className="text-sm text-neutral-400">No conversations yet</p>
              <p className="text-xs text-neutral-500 mt-1">Customer messages will appear here</p>
            </div>
          ) : (
            chats.map((c) => {
              const unread = c.lastSender === "user";
              const name = composeName(c.user) || "Unknown user";
              const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

              return (
                <div
                  key={c.id}
                  onClick={() => navigate(`/chats/${c.id}`)}
                  className={`
                    p-4 rounded-xl cursor-pointer transition-all border group
                    ${
                      unread
                        ? "bg-yellow-500/5 border-yellow-500/40 hover:border-yellow-500/60"
                        : "bg-neutral-950/60 border-neutral-800 hover:border-neutral-600"
                    }
                  `}
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Avatar */}
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
                        unread 
                          ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40"
                          : "bg-neutral-800 text-neutral-400 border border-neutral-700"
                      }`}>
                        {initials || "?"}
                      </div>
                      
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate group-hover:text-yellow-200 transition">{name}</div>
                        <div className="text-[11px] text-neutral-500 truncate">
                          {c.user?.phone || c.user?.email || "—"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={(e) => navigateToUser(e, c)}
                        className="hidden sm:inline-flex text-[11px] rounded-full border border-neutral-700 px-3 py-1.5 text-neutral-300 hover:bg-neutral-800 transition"
                      >
                        View user
                      </button>
                      {unread && (
                        <span className="text-[10px] bg-yellow-500 text-black px-2.5 py-1 rounded-full font-medium animate-pulse">
                          New
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Bubble-style message preview */}
                  <div className="flex pl-13">
                    <div
                      className={`
                        max-w-full sm:max-w-[85%] px-3.5 py-2 text-sm rounded-2xl truncate
                        ${
                          unread
                            ? "bg-yellow-500/15 text-yellow-200 rounded-bl-sm border border-yellow-500/20"
                            : "bg-neutral-800/60 text-neutral-400 rounded-bl-sm"
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
