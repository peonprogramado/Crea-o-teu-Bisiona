# Instrucciones para probar el Shader5

## Cómo activar el efecto Shader5:

1. **Abrir index.html** en el navegador
2. **Abrir la consola del navegador** (F12 → Console)
3. **Configurar los sliders:**
   - **Semitono**: Subir a cualquier valor mayor que 1
   - **Acuarela**: Subir a cualquier valor mayor que 0
   - **Contorno**: Mantener en 0 (para modo relleno)
4. **Cambiar color del SVG** (opcional):
   - Usar los botones redondos del lateral derecho para cambiar entre negro, azul y blanco
   - Esto cambiará los colores del shader5 automáticamente

## Qué debería pasar:

- En la consola aparecerá: `🎨 Shader5 activado - Condiciones cumplidas:`
- El efecto visual será círculos animados sobre el SVG con colores adaptativos:
  - **SVG Negro/Azul**: Círculos en tonos azules
  - **SVG Blanco**: Círculos en tonos blancos/grises claros
  - **Otros colores**: Círculos con colores HSB originales

## Archivos de prueba adicionales:

- **debug_shader5.html**: Muestra solo el efecto shader5 puro
- **test_shader5.html**: Permite probar con sliders independientes

## Notas importantes:

- El efecto solo funciona en **modo relleno** (Contorno = 0)
- Se necesita **Semitono > 1** Y **Acuarela > 0** (cualquier valor)
- El efecto reemplaza otros efectos cuando está activo
- Es animado y cambia con el tiempo
- La intensidad del efecto depende de los valores de los sliders

## Si no funciona:

1. Verificar que no hay errores en la consola
2. Comprobar que los sliders están en los valores correctos
3. Asegurarse de que Contorno está en 0
4. Probar con debug_shader5.html para ver el efecto puro
