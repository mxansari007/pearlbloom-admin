import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { getUploadCallable } from "../lib/functions";

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = (e) => reject(e);
    fr.readAsDataURL(file);
  });

function Btn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`min-w-8 h-8 px-2 rounded-md text-sm font-semibold transition-colors ${
        active ? "bg-amber-100 text-amber-900" : "text-gray-700 hover:bg-gray-100"
      }`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const setLink = useCallback(() => {
    if (editor.state.selection.empty) {
      alert("Select the word(s) you want to link first.");
      return;
    }
    const prev = (editor.getAttributes("link").href as string) || "";
    const url = window.prompt(
      "Link URL (internal e.g. /earrings/style/stud, or full https:// URL):",
      prev
    );
    if (url === null) return; // cancelled
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const onPickImage = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;

      let alt = "";
      while (!alt.trim()) {
        const entered = window.prompt("Describe this image (alt text — required for SEO & accessibility):", "");
        if (entered === null) return; // cancelled
        alt = entered;
      }

      try {
        setUploading(true);
        const dataUrl = await fileToDataUrl(file);
        const res = await getUploadCallable()({ filename: file.name, mimeType: file.type, base64: dataUrl });
        const url = res.data?.url;
        if (!url) throw new Error(res.data?.error || "Upload failed");
        editor.chain().focus().setImage({ src: url, alt: alt.trim() }).run();
      } catch (err) {
        alert(`Image upload failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      } finally {
        setUploading(false);
      }
    },
    [editor]
  );

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-gray-50 p-2 sticky top-0 z-10 rounded-t-xl">
      <Btn title="Heading 2 (section)" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</Btn>
      <Btn title="Heading 3 (sub-heading)" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</Btn>
      <span className="mx-1 h-5 w-px bg-gray-300" />
      <Btn title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></Btn>
      <Btn title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></Btn>
      <span className="mx-1 h-5 w-px bg-gray-300" />
      <Btn title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>•</Btn>
      <Btn title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.</Btn>
      <Btn title="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝</Btn>
      <span className="mx-1 h-5 w-px bg-gray-300" />
      <Btn title="Add / edit link on selected text" active={editor.isActive("link")} onClick={setLink}>🔗</Btn>
      <Btn title="Remove link" onClick={() => editor.chain().focus().unsetLink().run()}>⛓️‍💥</Btn>
      <Btn title="Insert image" onClick={() => fileRef.current?.click()}>{uploading ? "…" : "🖼️"}</Btn>
      <span className="mx-1 h-5 w-px bg-gray-300" />
      <Btn title="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>⌫</Btn>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
    </div>
  );
}

export default function RichTextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener" } }),
      Image.configure({ HTMLAttributes: { class: "blog-img" } }),
      Placeholder.configure({ placeholder: "Write your story… use H2 for sections, H3 for sub-headings." }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "tiptap-content prose-blog min-h-[320px] max-w-none px-4 py-3 focus:outline-none",
      },
    },
  });

  // Sync external value (e.g. when an existing post finishes loading).
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
