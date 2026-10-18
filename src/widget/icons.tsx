import React from "react";

export function EnvoyMark(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" {...props}>
            <path
                d="M6.5 12c2.2-4.2 8.8-4.2 11 0c-2.2 4.2-8.8 4.2-11 0Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
            />
            <path
                d="M12 9.4a2.6 2.6 0 1 0 0 5.2a2.6 2.6 0 0 0 0-5.2Z"
                fill="currentColor"
                opacity="0.9"
            />
        </svg>
    );
}

export function CloseIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...props}>
            <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
            />
        </svg>
    );
}

export function SendIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" {...props}>
            <path
                d="M4 12l16-8-6.5 16-2.5-6-7-2Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
            />
        </svg>
    );
}

const stroke = { stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

export function ChatIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden {...props}>
            <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 17H11l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5Z" {...stroke} />
            <circle cx="8.5" cy="11.3" r="1.1" fill="currentColor" />
            <circle cx="12" cy="11.3" r="1.1" fill="currentColor" />
            <circle cx="15.5" cy="11.3" r="1.1" fill="currentColor" />
        </svg>
    );
}

export function LockIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden {...props}>
            <rect x="5" y="10.5" width="14" height="9.5" rx="2.2" {...stroke} />
            <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" {...stroke} />
        </svg>
    );
}

export function ExternalIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden {...props}>
            <path d="M14 5h5v5M19 5l-8 8M17 14v4a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 5 18V8.5A1.5 1.5 0 0 1 6.5 7H10" {...stroke} />
        </svg>
    );
}

export function ChevronIcon({ dir = 'right', ...props }: React.SVGProps<SVGSVGElement> & { dir?: 'left' | 'right' }) {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden {...props}>
            <path d={dir === 'right' ? 'M9.5 6l6 6-6 6' : 'M14.5 6l-6 6 6 6'} {...stroke} strokeWidth={2} />
        </svg>
    );
}

/** Neutral SUV silhouette for listings without authorized photos (never a stock photo). */
export function VehicleSilhouette(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 160 70" aria-hidden {...props}>
            <path
                d="M12 50c0-6 3-9 9-10l14-3 14-13c3-3 6-4 11-4h42c5 0 8 1 11 4l13 13 13 3c6 1 9 4 9 10v4c0 2-1 3-3 3h-8M40 57H66M110 57H94"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path d="M52 37l10-11c2-2 4-3 7-3h17v14H52ZM93 23h17c3 0 5 1 7 3l10 11H93Z" fill="currentColor" opacity=".18" />
            <circle cx="30" cy="57" r="9" fill="none" stroke="currentColor" strokeWidth="3" />
            <circle cx="130" cy="57" r="9" fill="none" stroke="currentColor" strokeWidth="3" />
        </svg>
    );
}
