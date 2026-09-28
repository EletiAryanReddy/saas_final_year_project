import { ZodTypeAny, z } from 'zod';

export const parse = <T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> => schema.parse(data);
