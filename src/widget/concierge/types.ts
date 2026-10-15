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
};

export type OtdLine = { label: string; amount: number; kind: 'price' | 'dealer_fee' | 'tax' | 'government' };

export type Card =
    | { kind: 'appointment'; id: string; type: string; status: string; outcome: 'requested' | 'pending' | 'confirmed'; date: string | null; time: string | null; label: string; verified: boolean }
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
          at: number;
      };
