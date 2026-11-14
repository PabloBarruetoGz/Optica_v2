ALTER TABLE carousels ADD COLUMN description text NOT NULL DEFAULT '';
UPDATE carousels SET description = CASE key
  WHEN 'exam' THEN 'Atención de 15 min por persona. Capacidad para aprox. 40 personas en jornada completa, a cargo de Tecnólogo Médico certificado e incluye receta.'
  WHEN 'glasses' THEN 'Exhibición de más de 200 modelos de lentes para hombres y mujer'
  WHEN 'delivery' THEN 'Todos los lentes se entregan en el lugar de trabajo en 7 a 10 días hábiles. Postventa incluida.'
  ELSE '' END;
