"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import {
  Bold, Italic, List, ListOrdered,
  Link as LinkIcon, Heading2, Heading3, ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState, useCallback, useRef } from "react";

interface ImagePasteResult {
  attachmentId: string;
  previewUrl: string;
}

interface RichEditorProps {
  content?: Record<string, unknown> | null;
  onChange?: (json: Record<string, unknown>, plainText: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onImagePaste?: (file: File) => Promise<ImagePasteResult | null>;
  /** Map of attachmentId -> fresh preview URL for rendering stored images */
  imageUrlMap?: Record<string, string>;
  onSubmit?: () => void;
  placeholder?: string;
  editable?: boolean;
  minimal?: boolean;
  minHeight?: number;
}

/** Extract all attachment IDs from rich text JSON (images stored as attachment:{id}) */
export function extractAttachmentIds(json: Record<string, unknown> | null | undefined): string[] {
  if (!json) return [];
  const ids: string[] = [];
  function walk(node: any) {
    if (node?.type === "image" && typeof node.attrs?.src === "string") {
      const src = node.attrs.src as string;
      if (src.startsWith("attachment:")) {
        ids.push(src.replace("attachment:", ""));
      }
    }
    if (Array.isArray(node?.content)) {
      for (const child of node.content) walk(child);
    }
  }
  walk(json);
  return ids;
}

/** Replace attachment:{id} src values with resolved preview URLs in rich text JSON */
function resolveImageSrcs(json: Record<string, unknown>, urlMap: Record<string, string>): Record<string, unknown> {
  const str = JSON.stringify(json);
  const resolved = str.replace(/attachment:([a-f0-9-]+)/g, (match, id) => {
    return urlMap[id] || match;
  });
  return JSON.parse(resolved);
}

const PASTE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
const MAX_PASTE_SIZE = 10 * 1024 * 1024; // 10 MB

export function RichEditor({
  content, onChange, onFocus, onBlur, onImagePaste, imageUrlMap,
  onSubmit, placeholder, editable = true, minimal = false, minHeight,
}: RichEditorProps) {
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const [uploading, setUploading] = useState(false);
  const placeholderIdRef = useRef(0);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: minimal ? false : { levels: [2, 3] },
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: {
          class: "rounded-lg max-w-full my-2",
        },
      }),
    ],
    content: (content && imageUrlMap) ? resolveImageSrcs(content, imageUrlMap) : (content || ""),
    editable,
    editorProps: {
      attributes: {
        class: cn(
          "tiptap-content focus:outline-none min-h-[60px] px-3 py-2 text-sm text-gray-700",
          !editable && "cursor-default"
        ),
      },
      // Shift+Enter → submit
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && event.shiftKey && onSubmit) {
          event.preventDefault();
          onSubmit();
          return true;
        }
        return false;
      },
      // Intercept paste events to handle images
      handlePaste: (view, event) => {
        if (!onImagePaste) return false;

        const items = event.clipboardData?.items;
        if (!items) return false;

        for (const item of Array.from(items)) {
          if (PASTE_IMAGE_TYPES.includes(item.type)) {
            const file = item.getAsFile();
            if (!file) continue;

            if (file.size > MAX_PASTE_SIZE) {
              alert("Image exceeds 10 MB limit");
              return true;
            }

            event.preventDefault();
            handleImageUpload(file);
            return true;
          }
        }
        return false;
      },
      // Intercept drop events for images
      handleDrop: (view, event) => {
        if (!onImagePaste) return false;

        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;

        const file = files[0];
        if (PASTE_IMAGE_TYPES.includes(file.type)) {
          event.preventDefault();
          handleImageUpload(file);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (onChange) {
        onChange(ed.getJSON() as Record<string, unknown>, ed.getText());
      }
    },
    onFocus: () => onFocus?.(),
    onBlur: () => onBlur?.(),
  });

  async function handleImageUpload(file: File) {
    if (!editor || !onImagePaste) return;

    setUploading(true);
    const placeholderId = ++placeholderIdRef.current;

    // Insert a clean "uploading" placeholder — a 1x1 transparent pixel with identifying alt
    const transparentPixel = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    editor.chain().focus().setImage({ src: transparentPixel, alt: `uploading-${placeholderId}`, title: "Uploading..." }).run();

    try {
      const result = await onImagePaste(file);

      if (result && editor) {
        const durableSrc = `attachment:${result.attachmentId}`;
        const { doc } = editor.state;
        let placeholderPos: number | null = null;

        doc.descendants((node, pos) => {
          if (node.type.name === "image" && node.attrs.alt === `uploading-${placeholderId}`) {
            placeholderPos = pos;
            return false;
          }
        });

        if (placeholderPos !== null) {
          const tr = editor.state.tr;
          tr.setNodeMarkup(placeholderPos, undefined, {
            src: durableSrc,
            alt: `Pasted: ${file.name}`,
            title: result.previewUrl || "",
          });
          editor.view.dispatch(tr);
        }
      } else {
        removePlaceholder(placeholderId);
      }
    } catch {
      removePlaceholder(placeholderId);
    } finally {
      setUploading(false);
    }
  }

  function removePlaceholder(id: number) {
    if (!editor) return;
    const { doc } = editor.state;
    let pos: number | null = null;

    doc.descendants((node, nodePos) => {
      if (node.type.name === "image" && node.attrs.alt === `uploading-${id}`) {
        pos = nodePos;
        return false;
      }
    });

    if (pos !== null) {
      const tr = editor.state.tr;
      tr.delete(pos, pos + 1);
      editor.view.dispatch(tr);
    }
  }

  useEffect(() => {
    if (editor && content && !editor.isFocused) {
      const resolved = imageUrlMap ? resolveImageSrcs(content, imageUrlMap) : content;
      const currentJSON = JSON.stringify(editor.getJSON());
      const newJSON = JSON.stringify(resolved);
      if (currentJSON !== newJSON) {
        editor.commands.setContent(resolved);
      }
    }
  }, [content, editor, imageUrlMap]);

  const openLinkPopover = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, " ");

    if (editor.isActive("link")) {
      const attrs = editor.getAttributes("link");
      setLinkUrl(attrs.href || "");
      setLinkText(selectedText || "");
    } else {
      setLinkUrl("");
      setLinkText(selectedText || "");
    }
    setShowLinkPopover(true);
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor || !linkUrl.trim()) return;

    const url = linkUrl.trim().startsWith("http") ? linkUrl.trim() : `https://${linkUrl.trim()}`;

    if (linkText.trim()) {
      const { from, to } = editor.state.selection;
      if (from === to) {
        editor
          .chain()
          .focus()
          .insertContent(`<a href="${url}" target="_blank" rel="noopener noreferrer">${linkText.trim()}</a>`)
          .run();
      } else {
        editor.chain().focus().setLink({ href: url }).run();
      }
    } else {
      editor.chain().focus().setLink({ href: url }).run();
    }

    setShowLinkPopover(false);
    setLinkUrl("");
    setLinkText("");
  }, [editor, linkUrl, linkText]);

  if (!editor) return null;

  if (!editable) {
    return (
      <div
        className="tiptap-content text-sm text-gray-700"
        onClick={(e) => {
          const target = e.target as HTMLElement;
          const link = target.closest("a");
          if (link) {
            e.preventDefault();
            window.open(link.getAttribute("href") || "", "_blank", "noopener,noreferrer");
          }
        }}
      >
        <EditorContent editor={editor} />
      </div>
    );
  }

  return (
    <div
      className="border border-gray-200 rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-primary-500 focus-within:border-transparent transition-all duration-200"
      style={minHeight ? { minHeight } : undefined}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-gray-100 bg-gray-50 flex-wrap">
        <ToolbarBtn active={editor.isActive("bold")} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }} title="Bold">
          <Bold className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn active={editor.isActive("italic")} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }} title="Italic">
          <Italic className="w-3.5 h-3.5" />
        </ToolbarBtn>

        <div className="w-px h-4 bg-gray-200 mx-1" />

        <ToolbarBtn active={editor.isActive("bulletList")} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBulletList().run(); }} title="Bullet list">
          <List className="w-3.5 h-3.5" />
        </ToolbarBtn>
        <ToolbarBtn active={editor.isActive("orderedList")} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run(); }} title="Numbered list">
          <ListOrdered className="w-3.5 h-3.5" />
        </ToolbarBtn>

        {!minimal && (
          <>
            <div className="w-px h-4 bg-gray-200 mx-1" />
            <ToolbarBtn active={editor.isActive("heading", { level: 2 })} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 2 }).run(); }} title="Heading 2">
              <Heading2 className="w-3.5 h-3.5" />
            </ToolbarBtn>
            <ToolbarBtn active={editor.isActive("heading", { level: 3 })} onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 3 }).run(); }} title="Heading 3">
              <Heading3 className="w-3.5 h-3.5" />
            </ToolbarBtn>
          </>
        )}

        <div className="w-px h-4 bg-gray-200 mx-1" />

        <div className="relative">
          <ToolbarBtn active={editor.isActive("link")} onMouseDown={(e) => { e.preventDefault(); openLinkPopover(); }} title="Insert link">
            <LinkIcon className="w-3.5 h-3.5" />
          </ToolbarBtn>

          {showLinkPopover && (
            <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-50 p-3 space-y-2">
              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Link text</label>
                <input type="text" value={linkText} onChange={(e) => setLinkText(e.target.value)} placeholder="Display text" className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-0.5">URL</label>
                <input type="text" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://example.com" autoFocus className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } }} />
              </div>
              <div className="flex justify-between">
                {editor.isActive("link") && (
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().unsetLink().run(); setShowLinkPopover(false); }} className="text-[10px] text-danger-500 hover:text-danger-700">
                    Remove link
                  </button>
                )}
                <div className="flex gap-1.5 ml-auto">
                  <button type="button" onClick={() => setShowLinkPopover(false)} className="px-2 py-1 text-[10px] text-gray-500 hover:bg-gray-100 rounded">Cancel</button>
                  <button type="button" onClick={applyLink} disabled={!linkUrl.trim()} className="px-2 py-1 text-[10px] font-medium text-white bg-primary-600 rounded hover:bg-primary-700 disabled:opacity-40">Save</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {uploading && (
          <span className="text-[10px] text-gray-400 ml-2 animate-pulse">Uploading image...</span>
        )}
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarBtn({ active, onMouseDown, title, children }: { active: boolean; onMouseDown: (e: React.MouseEvent) => void; title: string; children: React.ReactNode }) {
  return (
    <button type="button" onMouseDown={onMouseDown} title={title} className={cn("p-1.5 rounded transition-colors", active ? "bg-primary-100 text-primary-700" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700")}>
      {children}
    </button>
  );
}

export function RichContent({ rich, plain, imageUrlMap }: { rich?: Record<string, unknown> | null; plain?: string | null; imageUrlMap?: Record<string, string> }) {
  if (rich) {
    return <RichEditor content={rich} editable={false} imageUrlMap={imageUrlMap} />;
  }
  if (plain) {
    return <p className="text-sm text-gray-700 whitespace-pre-wrap">{plain}</p>;
  }
  return <p className="text-sm text-gray-400 italic">No content</p>;
}
