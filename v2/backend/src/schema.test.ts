import test from 'node:test';
import assert from 'node:assert/strict';
import { inquirySchema } from './schema.js';
const person = { kind: 'Persona Natural', name: 'Persona de prueba', email: 'prueba@example.com', phone: '+56912345678', service: 'Receta de Lentes' };
test('acepta persona natural sin datos empresariales', () => assert.equal(inquirySchema.safeParse(person).success, true));
test('exige todos los campos empresariales', () => assert.equal(inquirySchema.safeParse({ ...person, kind: 'Operativo empresarial' }).success, false));
test('rechaza correo inválido, fechas imposibles y cantidades negativas', () => {
  for (const invalid of [{ email: 'invalid' }, { appointmentDate: '2026-02-30' }, { employees: -2 }]) assert.equal(inquirySchema.safeParse({ ...person, ...invalid }).success, false);
});
