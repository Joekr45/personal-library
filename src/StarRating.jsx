import React from 'react';

// 1–5 stars. Tap the left half of a star for a half star; tap the current rating again to clear it.
export default function StarRating({ value, onChange, size = 'md' }) {
  const px = size === 'sm' ? 12 : 26;
  const rating = Number(value) || 0;
  const interactive = Boolean(onChange);

  const star = (i) => {
    const fill = rating >= i ? 1 : rating >= i - 0.5 ? 0.5 : 0;
    const id = `half-${i}-${px}`;
    return (
      <span key={i} className="relative inline-block" style={{ width: px, height: px }}>
        <svg viewBox="0 0 24 24" width={px} height={px} aria-hidden="true">
          <defs>
            <linearGradient id={id}>
              <stop offset={`${fill * 100}%`} stopColor="#f59e0b" />
              <stop offset={`${fill * 100}%`} stopColor="#e2e8f0" />
            </linearGradient>
          </defs>
          <path
            fill={`url(#${id})`}
            d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"
          />
        </svg>
        {interactive && (
          <>
            <button type="button" aria-label={`${i - 0.5} stars`} className="absolute inset-y-0 left-0 w-1/2" onClick={() => onChange(rating === i - 0.5 ? null : i - 0.5)} />
            <button type="button" aria-label={`${i} stars`} className="absolute inset-y-0 right-0 w-1/2" onClick={() => onChange(rating === i ? null : i)} />
          </>
        )}
      </span>
    );
  };

  return (
    <span className="inline-flex items-center gap-0.5" title={rating ? `${rating} of 5 stars` : 'Not rated'}>
      {[1, 2, 3, 4, 5].map(star)}
    </span>
  );
}
