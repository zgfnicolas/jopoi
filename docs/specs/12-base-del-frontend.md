# S12 · Base del frontend, navegación y estados compartidos

Área: Frontend · base. Tamaño relativo: S. Dependencias: S01, S08, S11.
Estado: especificada para revisión; sin implementar. Etiqueta prevista al publicar: ready-for-agent.

## Problem Statement

La demo necesita una interfaz coherente que explique la tarea sin mezclar estados operativos, de sesión y de red. No existe una identidad visual aprobada que deba copiarse de los bocetos exploratorios.

## Solution

Definir una base responsive en español con navegación, jerarquía, controles accesibles y tratamiento consistente de carga, error, vacío, bloqueo y confirmación.

## User Stories

1. Como visitante, quiero reconocer siempre dónde estoy, para moverme entre explicación, demo y consulta.
2. Como visitante móvil, quiero completar las mismas tareas, para probar sin depender de escritorio.
3. Como visitante que usa teclado, quiero llegar a controles y mensajes, para completar el recorrido.
4. Como visitante, quiero diferenciar guardado local y registro de red, para entender el resultado de mis acciones.
5. Como visitante, quiero conservar lo escrito ante un error, para reintentar sin empezar de cero.
6. Como visitante, quiero ver qué se está cargando y qué está bloqueado, para evitar acciones repetidas.
7. Como responsable del prototipo, quiero una voz clara y consistente, para explicar el beneficio antes de la tecnología.
8. Como visitante, quiero saber que estoy en una demostración, para interpretar sus datos.

## Implementation Decisions

- Superficies propuestas: landing en /, recorrido en /demo y consulta compartible en /trazabilidad/{traceId}. Las rutas de interfaz no conceden permisos distintos a los contratos backend.
- Escribir en español coloquial, respetar Jopói y los términos del glosario. Mantener «Book a demo» como acceso solicitado, acompañado por una explicación de que permite conocer el prototipo.
- Componentes compartidos: navegación, acciones, campos con error, estados operativos, estado de red, leyenda de datos ficticios, aviso de sesión/cupo y manejo de dependencia indisponible.
- Separar visual y semánticamente recibido, confirmado en testnet y hash coincidente. Un color verde no debe hacer equivalentes esas tres afirmaciones.
- Estados mínimos de cada interacción: reposo, edición, guardando, resultado guardado, error de campo, conflicto, sesión vencida, cuota alcanzada y dependencia indisponible.
- Controles con nombres de acción, etiquetas persistentes, foco visible, orden de teclado y mensajes anunciables. No usar solo color o iconos para transmitir estado.
- Responsive sin perder contenido ni acciones: conservar el orden de lectura, reubicar resúmenes y evitar tablas que requieran ocultar datos esenciales en móvil.
- Formato de unidades explícito: kg, humedad %, ARS y zona temporal visible donde aporte contexto. La presentación localizada no altera los valores canónicos de la API.
- No fijar como aprobada ninguna dirección de los bocetos de preparación. La propuesta visual deberá mantenerse dentro del alcance sin introducir pantallas o funciones nuevas.
- No depender de servicios pagos ni de generación remota de QR. Activos y tipografías deben tener uso permitido y funcionar sin revelar secretos.

### Criterios de aceptación

1. Las tres superficies comparten lenguaje, navegación y estados comprensibles.
2. Todas las acciones esenciales son utilizables con teclado y en móvil.
3. Un fallo o conflicto conserva los datos del formulario y ofrece una recuperación concreta.
4. Las leyendas de prototipo y datos ficticios se encuentran sin buscar documentación técnica.
5. El frontend solo recibe atributos previstos por los DTO y no incorpora secretos en hidratación.

## Testing Decisions

S18 cubrirá comportamiento visible en navegador, teclado, carga, errores y móvil. S17 conserva la autoridad de validación backend; no se propone probar clases CSS o funciones de presentación.

## Out of Scope

Diseño definitivo en esta fase, código UI, nuevas pantallas, internacionalización completa, modo offline, aplicación nativa y adopción de bocetos no aprobados.

## Further Notes

Q1, Q3, Q27 y criterios de aceptación del alcance. No existe una identidad visual aprobada; esta spec define obligaciones de experiencia, no una paleta arbitrariamente ratificada.
