// Sara writes plain text with **bold** and bare links; build React nodes only (no HTML injection).
export function renderText(text: string) {
  return text.split(/(\*\*[^*]+\*\*|https?:\/\/[^\s<]*[^\s<.,!?;:)])/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^https?:\/\//.test(part)) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
          {part}
        </a>
      );
    }
    return part;
  });
}
