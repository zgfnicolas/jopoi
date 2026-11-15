# PRD — Documento de Requisitos del Producto: Jopói

**Versión:** 1.0 (Correspondiente a v0.22.0)  
**Última actualización:** 2026-11-15  
**Responsable:** Facundo Nicolás González  

---

## 1. Visión

Demostrar que la coordinación de subproductos agroforestales y el aprovechamiento de fletes de retorno pueden ser transparentes, económicamente ventajosos y criptográficamente verificables para la industria regional sin incurrir en costos de infraestructura ni intermediarios burocráticos.

---

## 2. Problema

En el corredor agroindustrial de Santa Rosa (Corrientes), los aserraderos generan excedentes constantes de biomasa y chips de madera sin tratar. Simultáneamente, camiones de carga general retornan vacíos tras descargar suministros, y compradores industriales de energía térmica demandan insumos constantes:
- **Descoordinación y asimetría:** No existe un canal ágil para coordinar lotes con viajes de regreso compatibles en horarios y capacidad.
- **Falta de confianza en pesajes y humedad:** Disputas habituales por mermas físicas, variaciones de humedad o rechazos sin causa documentada.
- **Costos de tecnología inaccesibles:** Las soluciones tradicionales de trazabilidad y ERP son prohibitivas para productores medianos y requieren cuentas complejas o criptomonedas.

---

## 3. Público objetivo

1. **Compradores industriales de biomasa:** Industrias con calderas o plantas de energía que compran chips bajo requisitos estrictos de humedad y peso.
2. **Generadores / Aserraderos:** Productores de biomasa que necesitan despachar lotes de chips sin ocupar espacio en playa.
3. **Transportistas de retorno:** Empresas y transportistas independientes que buscan amortizar costos de flete aprovechando viajes vacíos.
4. **Evaluadores y aliados comerciales:** Tomadores de decisión que evalúan el modelo operativo antes de su lanzamiento comercial.

---

## 4. Propuesta de valor

- **Transparencia verificable en red pública:** Cada hito de la operación queda sellado en Hedera Consensus Service (HCS) mediante hashes criptográficos RFC-8785 (JCS) + SHA-256 sin que el usuario deba pagar gas ni operar una wallet.
- **Aprovechamiento económico de fletes de retorno:** Cálculo transparente del beneficio ilustrativo por flete de retorno frente a tarifas convencionales de transporte dedicado.
- **Cero fricción y privacidad garantizada:** Acceso anónimo e inmediato mediante sesiones web efímeras, consulta pública accesible por código QR y separación rigurosa entre datos de contacto y datos operativos.

---

## 5. Alcance

### 5.1 Incluido en la versión actual (v0.22.0)
- Escenario agroforestal simulado con datos ficticios realistas del corredor de Santa Rosa (Corrientes).
- Sesión anónima de 24 horas con cuota de hasta 3 recorridos.
- Panel guiado multi-rol donde un usuario experimenta sucesivamente los roles de Generador, Coordinador, Transportista y Comprador.
- Recorrido operativo completo: Borrador → Publicado → Aprobado/Rechazado → Asignado → Retirado → Recibido Conforme / Con Incidencia.
- Validación estricta de compatibilidad de transporte (material, peso, carrocería, ruta y ventana horaria).
- Cálculo de beneficio económico y comparativa de flete de retorno.
- Anclaje de 5 hitos en Hedera Consensus Service testnet (mediante firma de servidor).
- Vista pública de trazabilidad y generación de código QR de solo lectura.
- Formulario de contacto comercial para solicitud de demostración.
- Observabilidad integrada, RUM privado, alertas y procedimientos de recuperación ante desastres (DRP).

### 5.2 Fuera de alcance (futuras evoluciones)
- Liquidación financiera, pagos en dinero real, escrow o wallets personales.
- Integración en tiempo real con básculas físicas o dispositivos GPS de flotas.
- Fraccionamiento de lotes o consolidación de cargas múltiples en un mismo camión.
- Despliegue en Hedera Mainnet (se opera exclusivamente en testnet con presupuesto cero).
- Cuentas empresariales autenticadas con contraseñas o Single Sign-On (SSO).
- Resolución de disputas comerciales o edición retroactiva de eventos registrados.

---

## 6. Historias de usuario

| ID | Como... | Quiero... | Para... | Prioridad |
| :--- | :--- | :--- | :--- | :--- |
| **HU-01** | Generador | Editar la cantidad y humedad en borrador y publicar el lote | Poner a disposición el subproducto para su coordinación. | Alta |
| **HU-02** | Coordinador | Evaluar la humedad declarada contra el requisito del comprador | Aprobar el lote o rechazarlo con causa justificada. | Alta |
| **HU-03** | Coordinador | Analizar la compatibilidad de los viajes de retorno precargados | Asignar el transporte más conveniente y viable. | Alta |
| **HU-04** | Transportista | Confirmar el retiro físico del lote en origen | Acreditar la custodia de la carga en tránsito. | Alta |
| **HU-05** | Comprador | Registrar el pesaje final recibido en destino | Confirmar la recepción conforme o reportar una incidencia de peso/calidad. | Alta |
| **HU-06** | Visitante / Auditor | Escanear el código QR o acceder a la URL pública de trazabilidad | Verificar el historial inmutable de hitos y contrastar los hashes en HCS. | Media |
| **HU-07** | Interesado comercial | Completar el formulario de contacto con mis datos corporativos | Solicitar una reunión o demostración formal del proyecto. | Media |
| **HU-08** | Administrador | Monitorear la salud operativa, cuotas y tareas de mantenimiento | Garantizar la disponibilidad del sistema dentro de los límites de presupuesto cero. | Alta |

---

### Criterios de aceptación (Gherkin)

#### HU-01: Publicación de Lote
- **Dado** un lote en estado `DRAFT` con cantidad positiva (> 0 kg) y humedad entre 0% y 100%,  
  **Cuando** el Generador presiona «Publicar lote»,  
  **Entonces** el lote pasa a estado `PUBLISHED`, se genera el evento inmutable `LOT_PUBLISHED` y se encola su registro en Hedera.  
- **Dado** un lote ya publicado,  
  **Cuando** el Generador intenta editar los valores declarados,  
  **Entonces** el sistema rechaza la modificación preservando la declaración original.

#### HU-02: Aprobación / Rechazo por Humedad
- **Dado** un comprador con requisito de humedad máxima del 35% y un lote publicado con 32% de humedad,  
  **Cuando** el Coordinador selecciona «Aprobar»,  
  **Entonces** el lote pasa a `APPROVED`.  
- **Dado** un lote publicado con humedad del 38%,  
  **Cuando** el Coordinador intenta aprobarlo,  
  **Entonces** el sistema bloquea la acción por exceder el límite y exige rechazar con el motivo `HUMIDITY_ABOVE_LIMIT`.

#### HU-03: Asignación de Viaje Compatible
- **Dado** un lote aprobado y un catálogo de viajes de retorno,  
  **Cuando** el Coordinador evalúa un viaje con capacidad menor al peso del lote o ruta no coincidente,  
  **Entonces** el viaje se marca como incompatible y no puede ser seleccionado.  
- **Dado** un viaje compatible en material, capacidad, carrocería, ruta y horario,  
  **Cuando** el Coordinador lo selecciona y confirma,  
  **Entonces** el lote pasa a estado `ASSIGNED`.

#### HU-05: Recepción Conforme e Incidencias
- **Dado** un lote en estado `PICKED_UP` con 28.000 kg declarados,  
  **Cuando** el Comprador registra un peso recibido de exactamente 28.000 kg y confirma conformidad,  
  **Entonces** el lote pasa al estado terminal `RECEIVED`.  
- **Dado** el mismo lote,  
  **Cuando** el Comprador registra 26.500 kg (merma),  
  **Entonces** la conformidad se bloquea y el sistema exige registrar una incidencia (`RECEIPT_ISSUE_REPORTED`) pasando a estado terminal `INCIDENT`.

---

## 7. Requisitos no funcionales

| ID | Categoría | Requisito | Verificación |
| :--- | :--- | :--- | :--- |
| **RNF-01** | **Rendimiento** | LCP < 2.5 s, CLS < 0.1 y respuesta de endpoints HTTP en p95 < 500 ms. | Monitoreo RUM privado y pruebas sintéticas. |
| **RNF-02** | **Seguridad** | Cookies de sesión anónimas con prefijo `__Host-`, HttpOnly, SameSite=Strict, CSRF y cabeceras CSP estrictas. | Pruebas de seguridad HTTP (`test:api`). |
| **RNF-03** | **Accesibilidad** | Cumplimiento estricto de WCAG 2.1 nivel AA en ambos temas (contraste >= 4.5:1 para texto). | Suite `tokens.test.ts` y auditoría en Chromium. |
| **RNF-04** | **Presupuesto Cero** | Operación íntegra dentro de los planes gratuitos de Vercel Hobby, Neon Serverless y testnet. | Arquitectura sin dependencias SaaS pagas. |
| **RNF-05** | **Resiliencia** | Tolerancia a suspensiones de Neon y demasías del mirror node de Hedera mediante patrón Outbox y estado transparente. | Pruebas de degradación y reintentos. |

---

## 8. Métricas de éxito

1. **Tiempo de recorrido guiado:** Un visitante completa los 6 pasos del recorrido en menos de 3 minutos.
2. **Determinismo criptográfico:** 100% de los hashes JCS/SHA-256 calculados en cliente coinciden con los registrados en base de datos y testnet.
3. **Disponibilidad de lectura:** Trazabilidad pública accesible en >= 99.5% de las consultas dentro del período de retención (7 días).
4. **Retención controlada:** Purga automática de datos de sesión caducados a las 24 horas y contactos a los 90 días.

---

## 9. Supuestos, riesgos y preguntas abiertas

- **Supuesto:** Los usuarios comprenden que las empresas, viajes y datos de Santa Rosa son ilustrativos y no comprometen entregas comerciales reales.
- **Riesgo:** Cuotas de Hedera testnet o pausas por inactividad de Neon que demoren la respuesta inicial de la base de datos (mitigado con advertencias en interfaz y reintentos idempotentes).
- **Pregunta abierta para v1.0:** ¿Qué mecanismo de firma digital o validación de identidad se utilizará cuando se incorporen transportistas y aserraderos reales?
