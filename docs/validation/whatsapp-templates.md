# Plantillas de WhatsApp para inmobiliarias de Salta (borradores para Ani)

Estado: **borradores. No se envió nada a nadie.** Ani revisa, ajusta el tono y envía desde su propio número. Español de Argentina, voseo, tono respetuoso.

Reglas para todos los mensajes:

- Decir la verdad: es una **idea en validación para un hackathon**. No hay usuarios, ni pilotos, ni clientes. Nunca insinuar lo contrario.
- Escribir solo al canal que la inmobiliaria publica como contacto de negocio (ver `docs/validation/agencies-salta.md`). Un solo mensaje inicial y un solo recordatorio. Si dicen que no, se agradece y no se insiste.
- No pedir datos personales ni documentos en el chat.
- Cada mensaje tiene como máximo 600 caracteres. Los largos que figuran abajo son conteos a mano **con los placeholders sin expandir** (aprox.); los textos reales quedan por debajo de 600 si el nombre de la inmobiliaria tiene menos de 40 caracteres.
- Placeholders: `{{tu_nombre}}`, `{{nombre}}` (persona que atiende, solo si la inmobiliaria lo publica), `{{nombre_agencia}}`, `{{opcion_1}}`, `{{opcion_2}}`, `{{modalidad}}` (llamada / videollamada / visita en la oficina).
- Después de cada contacto: actualizar `docs/validation/evidence.md` (con roles, no nombres) y la columna Status de `agencies-salta.md`.

## 1. Primer contacto (aprox. 500 caracteres)

> Hola, buenas tardes. Soy {{tu_nombre}}, de Salta. Con un equipo chico estamos validando una idea en un hackathon: una herramienta para que las inmobiliarias ordenen la pre-calificación de inquilinos. No tenemos usuarios ni vendemos nada todavía; queremos entender cómo lo hacen hoy ustedes. ¿Podés charlar 15 minutos sobre alquileres con alguien de {{nombre_agencia}}? Si no es el momento, sin problema. Te escribo a este número porque figura como contacto público de la inmobiliaria. ¡Gracias!

## 2. Seguimiento, 3 a 4 días después (aprox. 430 caracteres)

> Hola {{nombre}}, soy {{tu_nombre}} otra vez. Te escribí hace unos días por una charla de 15 minutos sobre cómo pre-califican inquilinos en {{nombre_agencia}}. Sé que andan con mucho trabajo, así que si preferís te mando 5 preguntas por escrito y las respondés cuando puedas. Es una idea en validación para un hackathon, no vendemos nada. Si no te interesa, avisame y no insisto. ¡Gracias por tu tiempo!

## 3. Coordinar la entrevista (aprox. 470 caracteres)

> ¡Genial, gracias {{nombre}}! Te propongo {{opcion_1}} o {{opcion_2}}, 15 minutos por {{modalidad}}. Si te sirve otro horario, me adapto. Tomo notas sin tu nombre ni el de la inmobiliaria: en nuestro registro figurarían solo como "Inmobiliaria A, macrocentro". Los nombraríamos únicamente con tu permiso por escrito. No grabo sin que lo autorices. Confirmame el horario y te mando un recordatorio el día anterior.

## 4. Agradecimiento después de la charla (aprox. 450 caracteres)

> Gracias por tu tiempo, {{nombre}}. Fue muy útil escucharte. Anotamos lo que nos contaste sin datos personales. Si querés, te comparto un resumen de lo que vayamos aprendiendo y una demo (usa datos de prueba y dinero de prueba, nada real). Y si en algún momento te interesa probar algo supervisado, con documentos de prueba o con la autorización de cada persona, te dejo una carta de intención no vinculante: no te compromete a nada. ¡Que tengas buena semana!

## 5. Respuesta si dicen que no (aprox. 200 caracteres, opcional)

> Gracias por contestarme, {{nombre}}, y por la honestidad. Si cambia algo más adelante, acá estamos. ¡Éxitos con {{nombre_agencia}}! Si querés, contame en una línea qué es lo que más les cuesta hoy en alquileres. Si no, está perfecto.

Nota: un "no" y la razón que den son un dato válido. Registrarlo en `evidence.md` como señal negativa o neutra.

## Variante para mensaje directo de Instagram o formulario web

Usar el texto 1 sin la última frase ("Te escribo a este número..."), reemplazada por: "Te escribo por este canal porque es el contacto público de la inmobiliaria."

---

## English summary (for judges)

Five draft WhatsApp messages in Argentine Spanish for Ani to send to Salta agencies: first contact, follow-up, scheduling, thank-you, and a polite reply to a refusal. Each is at most 600 characters. They state plainly that this is an idea being validated in a hackathon with no users or clients, ask for a 15-minute conversation, promise that notes use roles instead of names unless the agency consents in writing, and limit outreach to one message plus one reminder. Nothing has been sent.
