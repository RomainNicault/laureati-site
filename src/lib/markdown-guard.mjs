// Garde du Markdown éditorial : un texte copié du vault ne doit porter ni HTML brut,
// ni image, ni lien hors https://, chemin interne ou ancre. Le plugin remark fait
// échouer le build au premier nœud refusé ; la validation reste testable seule.

const ALLOWED_URL = /^(?:https:\/\/[^\s"<>]+|\/(?![/\\])[^\s"<>]*|#[^\s"<>]*)$/;

/** Vrai si l'URL est https://, un chemin interne (pas //) ou une ancre. */
export function urlAutorisee(url) {
  return typeof url === 'string' && ALLOWED_URL.test(url);
}

const where = (node) => node?.position?.start ? `ligne ${node.position.start.line} du corps` : 'position inconnue';

/** Liste les nœuds refusés d'un arbre mdast, sans rien modifier. */
export function violationsMarkdown(tree) {
  const violations = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    switch (node.type) {
      case 'html':
        violations.push(`HTML brut interdit (${where(node)}) : ${String(node.value).slice(0, 60)}`);
        break;
      case 'image':
      case 'imageReference':
        violations.push(`image interdite (${where(node)})`);
        break;
      case 'link':
      case 'definition':
        if (!urlAutorisee(node.url)) violations.push(`lien refusé (${where(node)}) : ${String(node.url).slice(0, 60)}`);
        break;
      case 'mdxJsxFlowElement':
      case 'mdxJsxTextElement':
      case 'mdxjsEsm':
      case 'mdxFlowExpression':
      case 'mdxTextExpression':
        violations.push(`syntaxe MDX interdite (${where(node)})`);
        break;
      default:
        break;
    }
    if (Array.isArray(node.children)) node.children.forEach(visit);
  };
  visit(tree);
  return violations;
}

/** Plugin remark : lève une erreur, donc fait échouer le build, si le texte est refusé. */
export function remarkGardeEditoriale() {
  return (tree, file) => {
    const violations = violationsMarkdown(tree);
    if (violations.length) {
      const name = file?.path ?? file?.history?.[0] ?? 'texte';
      throw new Error(`Markdown éditorial refusé (${name}) :\n- ${violations.join('\n- ')}`);
    }
  };
}
