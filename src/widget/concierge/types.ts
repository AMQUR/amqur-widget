export type Lang = 'en' | 'es';

export type PaymentAssumptions = {
    apr: number;
    aprSource: 'ILLUSTRATIVE' | 'CUSTOMER' | 'VERIFIED_OFFER';
    termMonths: number;
    downPayment: number;
    includesTaxAndFees: boolean;
    policyVersion: string;
};

export type Vehicle = {
    vin: string;
    stock?: string | null;
    year?: number | null;
    make?: string | null;
    model?: string | null;
    trim?: string | null;
    color?: string | null;
    mileage?: number | null;
    price?: number | null;
    msrp?: number | null;
    drivetrain?: string | null;
    fuelType?: string | null;
    bodyType?: string | null;
    transmission?: string | null;
    condition?: string | null;
    features?: string[];
    estimatedPayment?: number | null;
    paymentAssumptions?: PaymentAssumptions;
    photos?: string[];
    status?: string | null;
    lastSeenAt?: string | null;
    freshnessState?: string | null;
    /** Synthetic local-demo fixture — always badged, never presented as dealership stock. */
    simulated?: boolean;
    /** Canonical vehicle page on the owning rooftop's own website (https only; server-verified). */
    vdpUrl?: string | null;
    /** Rooftop that physically holds this vehicle — shown whenever results span stores. */
    rooftopName?: string | null;
    /** True only when the listed price is known to include dealer-required fees. */
    priceIncludesDealerFees?: boolean | null;
};

export type OtdLine = { label: string; amount: number; kind: 'price' | 'dealer_fee' | 'tax' | 'government' };

export type ContactChannel = 'EMAIL' | 'CALL' | 'TEXT';

/** One bookable time. `id` is opaque and server-issued; `expiresAt` bounds how long it is offered. */
export type AppointmentSlot = { id: string; start: string; end?: string | null; expiresAt?: string | null };

export type AppointmentWindow = 'morning' | 'afternoon' | 'evening';

export type LeadFormCard = {
    kind: 'lead_form';
    id: string;
    purpose: 'sales' | 'test_drive' | 'service' | 'parts' | 'callback';
    rooftopName: string;
    vehicleLabel?: string | null;
    vin?: string | null;
    /** Contact channels this rooftop can actually use right now. */
    channels: ContactChannel[];
    /** Versioned consent wording per channel, supplied by the server — never authored client-side. */
    consent: { version: string; text: Partial<Record<ContactChannel, string>> };
    /** Why the details are being asked for, in the customer's language. */
    reason?: string;
};

export type AppointmentPickerCard = {
    kind: 'appointment_picker';
    id: string;
    department: 'sales' | 'service' | 'parts';
    purpose: string;
    rooftopName: string;
    timezone: string;
    /** Server time when the card was issued; used to correct for a wrong device clock. */
    serverNow?: string | null;
    /**
     * provider_slots — real availability from an authorised scheduler; choosing one books it.
     * request_only   — no scheduler access; the customer states a preference and staff confirm.
     * external_link  — the store's own scheduling page; opening it books nothing here.
     */
    mode: 'provider_slots' | 'request_only' | 'external_link';
    slots?: AppointmentSlot[];
    /** ISO dates (yyyy-mm-dd) offered in request_only mode. */
    days?: string[];
    externalUrl?: string | null;
    vehicleLabel?: string | null;
    vin?: string | null;
    /** True when availability comes from a labelled sandbox scheduler rather than a live one. */
    sandbox?: boolean;
};

export type AppointmentCard = {
    kind: 'appointment';
    id: string;
    type: string;
    status: string;
    outcome: 'requested' | 'pending' | 'confirmed';
    date: string | null;
    time: string | null;
    label: string;
    verified: boolean;
    /** Present only with a provider confirmation. */
    providerRef?: string | null;
    providerName?: string | null;
    rooftopName?: string | null;
    department?: string | null;
    timezone?: string | null;
    startsAt?: string | null;
    sandbox?: boolean;
};

export type LeadSubmission = {
    formId: string;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    preferredChannel: ContactChannel;
    consents: Array<{ channel: ContactChannel; granted: boolean; version: string }>;
};

export type AppointmentSelection = {
    pickerId: string;
    slotId?: string;
    requestedDate?: string;
    requestedWindow?: AppointmentWindow;
};

export type Card =
    | AppointmentCard
    | LeadFormCard
    | AppointmentPickerCard
    | { kind: 'credit_application'; label: string; url: string; providerName: string | null; cta?: string; note?: string; preview?: boolean }
    | {
          kind: 'otd_quote';
          id: string;
          vin: string;
          vehicleLabel: string;
          status: 'estimate' | 'requested';
          paymentMethod: 'CASH' | 'FINANCE' | 'LEASE' | 'UNDECIDED';
          lines: OtdLine[];
          total: number | null;
          assumptions: string[];
          missingInputs: string[];
          preliminary: true;
      }
    | { kind: 'finance_request'; id: string; status: string }
    | {
          kind: 'trade';
          id: string;
          summary: string;
          appraisalVerified: boolean;
          value?: { kind: 'MARKET_ESTIMATE' | 'PRELIMINARY_ESTIMATE' | 'DEALER_APPRAISAL' | 'FINAL_OFFER'; amount: number | null; low: number | null; high: number | null; expiresAt: string | null } | null;
      }
    | { kind: 'parts'; id: string; status: string; fitmentVerified: boolean; priceVerified: boolean; availabilityVerified: boolean; etaVerified: boolean; needsVin: boolean }
    | { kind: 'handoff'; state: 'requested' | 'queued' | 'notified' | 'recorded'; escalationId: string }
    | { kind: 'hours'; summary: string; openNow: boolean | null; timezone: string }
    | { kind: 'payment'; vin: string; vehicleLabel?: string; product?: 'finance'; status?: 'estimate'; monthly: number; apr: number; aprSource: PaymentAssumptions['aprSource']; termMonths: number; downPayment: number; tradeEquity: number; price: number; includesTaxAndFees: boolean; disclaimer: string; policyVersion: string };

export type Journey = {
    selectedVehicle?: { vin: string; label: string } | null;
    payment?: { vin?: string; monthly: number; termMonths: number; downPayment: number; aprSource: string; product?: 'finance'; status?: 'estimate'; includesTaxAndFees?: boolean } | null;
    trade?: { summary: string; requestId?: string } | null;
    appointment?: { id: string; label: string; status: string } | null;
    creditApplication?: { state: string } | null;
    otdQuote?: { status: string; total: number | null; vin?: string } | null;
    service?: { need?: string; vehicle?: string } | null;
    parts?: { need?: string; status?: string } | null;
    handoff?: { state: string } | null;
};

export type ChatResponse = {
    reply: string;
    segments: string[];
    type?: 'vehicle_carousel' | 'vehicle_compare' | 'vehicle_detail' | 'payment_summary' | 'staff_handling';
    vehicles?: Vehicle[];
    cards: Card[];
    quickReplies: string[];
    journey: Journey;
    provenance?: { sources: string[]; inventoryAsOf?: string | null; disclaimer?: string; verifiedFactsOnly: boolean };
    evidence?: Array<{ field: string; verified: boolean; source: string | null; disclaimer?: string }>;
    conversation: { language: Lang; handoffState: string; aiPaused: boolean; pending: string };
    delivery: { urgent: boolean; toolCount: number; minTypingMs: number; maxTypingMs: number };
    conversationId?: string;
    /** True when the server minted a fresh id for this turn (widget should replace any prior id). */
    conversationIdIssued?: boolean;
};

export type PageContext = {
    pageType?: 'homepage' | 'inventory_search' | 'vdp' | 'specials' | 'finance' | 'service' | 'service_scheduler' | 'parts' | 'contact' | 'other';
    vin?: string;
    stockNumber?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    referrerClass?: 'direct' | 'search' | 'social' | 'email' | 'paid' | 'referral' | 'internal' | 'unknown';
};

export type UiMessage =
    | { id: string; role: 'user'; text: string; at: number }
    | {
          id: string;
          role: 'assistant';
          text: string;
          vehicles?: Vehicle[];
          compare?: boolean;
          cards?: Card[];
          disclaimer?: string;
          isError?: boolean;
          author?: 'ai' | 'staff' | 'system';
          displayName?: string | null;
          /** Set while text is still arriving, and when the customer stopped a reply early. */
          streaming?: boolean;
          stopped?: boolean;
          at: number;
      };

/** Typed server-sent events for POST /chat/stream (AMQUR's own envelope; additive to POST /chat). */
export type StreamEvent =
    | { type: 'turn.started'; turnId: string; conversationId?: string; conversationIdIssued?: boolean }
    | { type: 'status'; phase: 'thinking' | 'checking' | 'composing'; label?: string }
    | { type: 'text.delta'; index: number; text: string }
    | { type: 'text.done'; index: number }
    | { type: 'turn.completed'; response: ChatResponse }
    | { type: 'turn.error'; code: string; message: string; retryable?: boolean };
