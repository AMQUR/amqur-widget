export type Locale = 'en' | 'es';

const STRINGS: Record<Locale, Record<string, string>> = {
  en: {
    welcome: 'Welcome to {location}. What can I help you find today?',
    placeholder: 'Ask about vehicles, payments, service…',
    send: 'Send',
    offline: 'You are offline. Messages will send when connectivity returns.',
    retry: 'Retry',
    compare: 'Compare',
    save: 'Save',
    details: 'Details',
    payment: 'Est. payment',
    hold: 'Hold',
    talkToSomeone: 'Talk to someone',
    testDrive: 'Test drive',
    serviceHelp: 'I need service help',
    partsHelp: 'I need a parts quote',
    estimateOnly: 'Educational payment estimate only — not a lender offer.',
    provenance: 'Verified from dealership inventory records.',
    proactiveVdp: 'Would you like me to check current availability for this vehicle?',
    dismiss: 'Dismiss',
    language: 'Language',
  },
  es: {
    welcome: 'Bienvenido a {location}. ¿En qué puedo ayudarle hoy?',
    placeholder: 'Pregunte por vehículos, pagos, servicio…',
    send: 'Enviar',
    offline: 'Sin conexión. Los mensajes se enviarán al recuperarla.',
    retry: 'Reintentar',
    compare: 'Comparar',
    save: 'Guardar',
    details: 'Detalles',
    payment: 'Pago est.',
    hold: 'Reservar',
    talkToSomeone: 'Hablar con alguien',
    testDrive: 'Prueba de manejo',
    serviceHelp: 'Necesito ayuda con servicio',
    partsHelp: 'Necesito una cotización de partes',
    estimateOnly: 'Estimación educativa solamente — no es una oferta del prestamista.',
    provenance: 'Verificado con el inventario del concesionario.',
    proactiveVdp: '¿Desea que verifique la disponibilidad actual de este vehículo?',
    dismiss: 'Cerrar',
    language: 'Idioma',
  },
};

export function t(
  locale: Locale,
  key: string,
  vars?: Record<string, string>,
): string {
  let s = STRINGS[locale]?.[key] ?? STRINGS.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(`{${k}}`, v);
    }
  }
  return s;
}

export function detectLocale(preferred?: string | null): Locale {
  if (preferred === 'es' || preferred === 'en') return preferred;
  if (typeof navigator !== 'undefined' && navigator.language?.startsWith('es')) {
    return 'es';
  }
  return 'en';
}
