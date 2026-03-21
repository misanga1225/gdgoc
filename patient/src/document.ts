import DOMPurify from "dompurify";

/**
 * Cloud StorageからHTMLドキュメントを取得してDOMに挿入する
 * @returns data-paragraph-id属性を持つ全要素の配列
 */
export async function loadDocument(
  documentUrl: string,
  container: HTMLElement
): Promise<HTMLElement[]> {
  const resp = await fetch(documentUrl);
  if (!resp.ok) {
    throw new Error(`Failed to fetch document: ${resp.status}`);
  }

  const html = await resp.text();
  container.innerHTML = DOMPurify.sanitize(html);

  // data-paragraph-id属性を持つ全要素を収集
  const paragraphs = Array.from(
    container.querySelectorAll<HTMLElement>("[data-paragraph-id]")
  );

  return paragraphs;
}
