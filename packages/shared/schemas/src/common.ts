import { z } from 'zod';

export const Uuid = z.string().uuid();

/** Real calendar date, ISO `YYYY-MM-DD`. Display format `YYYY.MM.DD` is a UI/document concern. */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, 'Invalid date');

/** `HH:mm` 24-hour time. */
export const TimeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** Old NIC: 9 digits + V/X. New NIC: 12 digits (§4.3). */
export const Nic = z.string().regex(/^(\d{9}[VvXx]|\d{12})$/);

/** CR number `n/yyyy` (§4.3). */
export const CrNumber = z.string().regex(/^[1-9]\d*\/\d{4}$/);

/** Money as integer rupees-cents style (no floats). */
export const MoneyCents = z.number().int().nonnegative();

export const Role = z.enum(['oic', 'detecting', 'observation', 'supervising']);
export type Role = z.infer<typeof Role>;
