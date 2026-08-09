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
    saved: 'Saved',
    details: 'Details',
    payment: 'Est. payment',
    hold: 'Hold',
    talkToSomeone: "I'd like to speak with a team member",
    requestSaved: 'Your request has been saved. A team member will follow up.',
    testDrive: 'Test drive',
    serviceHelp: 'I need service help',
    partsHelp: 'I need a parts quote',
    requestAppointment: 'I would like to request a service appointment',
    tradeInterest: 'I am interested in trading in my vehicle',
    financeHandoff: 'I would like help with financing options',
    estimateOnly: 'Educational payment estimate only — not a lender offer.',
    provenance: 'Verified from dealership inventory records.',
    proactiveVdp: 'Would you like me to check current availability for this vehicle?',
    dismiss: 'Dismiss',
    language: 'Language',
    firstName: 'First name',
    lastName: 'Last name',
    email: 'Email',
    phone: 'Phone',
    consentRequired: 'Please accept the consent statement to continue.',
    contactRequired: 'Enter an email or phone number.',
    submitLead: 'Submit',
    leadSubmitted: 'Thank you — your information has been submitted.',
    savedVehicles: 'Saved vehicles',
    noSavedVehicles: 'No saved vehicles yet.',
    compareSelected: 'Compare selected ({count})',
    compareMax: 'You can compare up to 3 vehicles.',
    compareSend: 'Compare these vehicles: {vins}',
    removeFromCompare: 'Remove',
    privacy: 'Privacy',
    terms: 'Terms',
    addToCompare: 'Add to compare',
    inCompare: 'In compare',
    askAboutSaved: 'Tell me about {vin}',
  },
  es: {
    welcome: 'Bienvenido a {location}. ¿En qué puedo ayudarle hoy?',
    placeholder: 'Pregunte por vehículos, pagos, servicio…',
    send: 'Enviar',
    offline: 'Sin conexión. Los mensajes se enviarán al recuperarla.',
    retry: 'Reintentar',
    compare: 'Comparar',
    save: 'Guardar',
    saved: 'Guardados',
    details: 'Detalles',
    payment: 'Pago est.',
    hold: 'Reservar',
    talkToSomeone: 'Me gustaría hablar con un miembro del equipo',
    requestSaved: 'Su solicitud ha sido guardada. Un miembro del equipo dará seguimiento.',
    testDrive: 'Prueba de manejo',
    serviceHelp: 'Necesito ayuda con servicio',
    partsHelp: 'Necesito una cotización de partes',
    requestAppointment: 'Me gustaría solicitar una cita de servicio',
    tradeInterest: 'Estoy interesado en entregar mi vehículo como parte de pago',
    financeHandoff: 'Me gustaría ayuda con opciones de financiamiento',
    estimateOnly: 'Estimación educativa solamente — no es una oferta del prestamista.',
    provenance: 'Verificado con el inventario del concesionario.',
    proactiveVdp: '¿Desea que verifique la disponibilidad actual de este vehículo?',
    dismiss: 'Cerrar',
    language: 'Idioma',
    firstName: 'Nombre',
    lastName: 'Apellido',
    email: 'Correo',
    phone: 'Teléfono',
    consentRequired: 'Acepte el consentimiento para continuar.',
    contactRequired: 'Ingrese un correo o teléfono.',
    submitLead: 'Enviar',
    leadSubmitted: 'Gracias — su información ha sido enviada.',
    savedVehicles: 'Vehículos guardados',
    noSavedVehicles: 'Aún no hay vehículos guardados.',
    compareSelected: 'Comparar seleccionados ({count})',
    compareMax: 'Puede comparar hasta 3 vehículos.',
    compareSend: 'Comparar estos vehículos: {vins}',
    removeFromCompare: 'Quitar',
    privacy: 'Privacidad',
    terms: 'Términos',
    addToCompare: 'Agregar a comparar',
    inCompare: 'En comparación',
    askAboutSaved: 'Cuénteme sobre {vin}',
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
