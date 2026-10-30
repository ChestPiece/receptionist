import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { renderText } from "./render-text";

const html = (text: string) => renderToStaticMarkup(createElement("div", null, renderText(text)));

test("bold becomes strong", () => expect(html("a **b** c")).toContain("a <strong>b</strong> c"));
test("newlines are kept", () => expect(html("a\nb")).toContain("a\nb"));
test("bare URL becomes a safe link", () =>
  expect(html("see https://x.com/a?b=1 now")).toContain('<a href="https://x.com/a?b=1" target="_blank" rel="noopener noreferrer"'));
test("plain text is unchanged", () => expect(html("hello")).toContain(">hello<"));
test("script text is escaped, not rendered", () => {
  const out = html("<script>alert(1)</script>");
  expect(out).not.toContain("<script>");
  expect(out).toContain("&lt;script&gt;");
});
