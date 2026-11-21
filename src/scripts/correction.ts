// Turnstile n'est chargé qu'après une interaction avec le formulaire de correction.
// Le jeton est ajouté au POST /api/correction et vérifié par le Worker avant toute écriture D1.
// Sans JavaScript, le formulaire reste affiché mais le Worker refuse l'envoi (fail closed).
type TurnstileApi = {
  render(target: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId?: string): void;
};

const ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const current = () => (window as unknown as { turnstile?: TurnstileApi }).turnstile;
let loading: Promise<TurnstileApi> | undefined;

function load(): Promise<TurnstileApi> {
  const api = current();
  if (api) return Promise.resolve(api);
  loading ||= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = ENDPOINT;
    script.async = true;
    script.addEventListener('load', () => {
      const ready = current();
      if (ready) resolve(ready); else reject(new Error('Turnstile absent'));
    });
    script.addEventListener('error', () => reject(new Error('Turnstile indisponible')));
    document.head.append(script);
  }).catch((error) => { loading = undefined; throw error; });
  return loading;
}

const UNAVAILABLE = 'Le contrôle anti-robot est indisponible. Réessayez plus tard.';
const SEND_FAILED = 'Envoi impossible : le contrôle anti-robot n’a pas abouti. Réessayez plus tard ou écrivez à contact@laureati.fr.';
// Délai maximal d'un envoi en attente d'un jeton, hors défi interactif affiché.
const PENDING_LIMIT_MS = 20000;

for (const form of document.querySelectorAll<HTMLFormElement>('form[action="/api/correction"]')) {
  const zone = form.querySelector<HTMLElement>('[data-turnstile-sitekey]');
  const status = form.querySelector<HTMLElement>('[data-turnstile-status]');
  const sitekey = zone?.dataset.turnstileSitekey ?? '';
  const details = form.closest('details');
  let widget: string | undefined;
  let verified = false;
  let pending = false;
  let preparing = false;
  let failed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const say = (message: string) => { if (status) status.textContent = message; };
  const stopTimer = () => { if (timer !== undefined) { clearTimeout(timer); timer = undefined; } };

  // Un envoi en attente ne reste jamais sur « en cours » : il échoue avec un message clair.
  function abandon(message: string): void {
    stopTimer();
    if (pending) { pending = false; say(SEND_FAILED); } else say(message);
  }

  // Le widget réapparaît (nouvel essai, défi affiché ou réinitialisation) : le message d'échec n'a plus lieu d'être.
  function recovered(): void {
    if (!failed) return;
    failed = false;
    say(pending ? 'Vérification anti-robot en cours…' : '');
  }

  async function prepare(reset = false): Promise<void> {
    if (!sitekey || !zone || preparing) return;
    preparing = true;
    try {
      const api = await load();
      if (widget) {
        if (!reset) return;
        verified = false;
        api.reset(widget);
        recovered();
        return;
      }
      widget = api.render(zone, {
        sitekey,
        action: 'correction',
        appearance: 'interaction-only',
        language: 'fr',
        callback: () => {
          verified = true;
          failed = false;
          stopTimer();
          say('');
          if (pending) { pending = false; form.requestSubmit(); }
        },
        'before-interactive-callback': () => {
          // Défi affiché : l'utilisateur doit agir, le délai d'attente ne s'applique plus.
          stopTimer();
          recovered();
          if (pending) say('Validez le contrôle anti-robot ci-dessous.');
        },
        'error-callback': () => {
          verified = false;
          failed = true;
          abandon(UNAVAILABLE);
        },
        'unsupported-callback': () => {
          verified = false;
          failed = true;
          abandon(UNAVAILABLE);
        },
        'expired-callback': () => {
          verified = false;
          say('Le contrôle anti-robot a expiré. Validez à nouveau.');
        },
        'timeout-callback': () => {
          verified = false;
          say('Le contrôle anti-robot a expiré. Validez à nouveau.');
        },
      });
      recovered();
    } catch {
      failed = true;
      abandon(UNAVAILABLE);
    } finally {
      preparing = false;
    }
  }

  // Aucun script tiers avant une interaction : ouverture du bloc ou focus dans le formulaire.
  details?.addEventListener('toggle', () => { if (details.open) void prepare(); }, { once: true });
  form.addEventListener('focusin', () => { void prepare(); }, { once: true });

  // Retour arrière depuis le cache du navigateur : le jeton a déjà été consommé par le Worker.
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    verified = false;
    pending = false;
    stopTimer();
    say('');
    const api = current();
    if (widget && api) { api.reset(widget); failed = false; }
  });

  form.addEventListener('submit', (event) => {
    if (!sitekey) {
      event.preventDefault();
      say(UNAVAILABLE);
      return;
    }
    if (verified) return; // le champ caché cf-turnstile-response accompagne l'envoi natif
    event.preventDefault();
    pending = true;
    say('Vérification anti-robot en cours…');
    stopTimer();
    timer = setTimeout(() => { timer = undefined; abandon(UNAVAILABLE); }, PENDING_LIMIT_MS);
    void prepare(true);
  });
}
