const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'code', 'col', 'colgroup',
  'dd', 'del', 'details', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li',
  'mark', 'ol', 'p', 'pre', 's', 'small', 'span', 'strong', 'sub', 'summary',
  'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul'
]);

const GLOBAL_ATTRS = new Set(['class', 'title']);
const ATTRS_BY_TAG = {
  a: new Set(['href', 'name', 'target', 'rel']),
  img: new Set(['alt', 'height', 'src', 'width']),
  td: new Set(['align', 'colspan', 'rowspan']),
  th: new Set(['align', 'colspan', 'rowspan']),
  col: new Set(['span']),
  colgroup: new Set(['span'])
};

const URL_ATTRS = new Set(['href', 'src']);
const SAFE_URL_PATTERN = /^(https?:|mailto:|tel:|data:image\/(?:png|gif|jpe?g|webp|svg\+xml);|blob:|#|\/|\.\/|\.\.\/)/i;

export function sanitizeHtml(html) {
  if (!html) return '';

  const template = document.createElement('template');
  template.innerHTML = html;
  cleanNode(template.content);
  return template.innerHTML;
}

export function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanNode(root) {
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.COMMENT_NODE) {
      node.remove();
      continue;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    const tag = node.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      node.replaceWith(...Array.from(node.childNodes));
      continue;
    }

    cleanAttributes(node, tag);
    cleanNode(node);
  }
}

function cleanAttributes(node, tag) {
  const allowedForTag = ATTRS_BY_TAG[tag] || new Set();

  for (const attr of Array.from(node.attributes)) {
    const name = attr.name.toLowerCase();
    const value = attr.value.trim();
    const isAllowed = GLOBAL_ATTRS.has(name) || allowedForTag.has(name);

    if (!isAllowed || name.startsWith('on') || name === 'style') {
      node.removeAttribute(attr.name);
      continue;
    }

    if (URL_ATTRS.has(name) && value && !SAFE_URL_PATTERN.test(value)) {
      node.removeAttribute(attr.name);
    }
  }

  if (tag === 'a') {
    const target = node.getAttribute('target');
    if (target === '_blank') node.setAttribute('rel', 'noopener noreferrer');
  }
}
