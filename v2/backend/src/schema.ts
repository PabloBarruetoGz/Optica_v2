import { z } from 'zod';
export const inquirySchema = z.object({
  kind: z.enum(['Persona Natural', 'Operativo empresarial']),
  name: z.string().trim().min(2).max(150),
  email: z.email().max(254),
  phone: z.string().trim().regex(/^[+\d ()-]{7,25}$/),
  service: z.enum(['Receta de Lentes', 'Adaptación de Lente de contacto', 'Compra de Lentes óptico']),
  company: z.string().trim().min(2).max(200).optional(),
  employees: z.number().int().positive().max(1000000).optional(),
  appointmentDate: z.iso.date().optional(),
  appointmentTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  address: z.string().trim().max(300).optional(),
  message: z.string().trim().max(5000).default(''),
}).superRefine((value, ctx) => {
  if (value.kind === 'Operativo empresarial') {
    for (const field of ['company', 'employees', 'appointmentDate', 'appointmentTime'] as const) {
      if (!value[field]) ctx.addIssue({ code: 'custom', path: [field], message: 'Campo obligatorio para empresas' });
    }
  }
});
