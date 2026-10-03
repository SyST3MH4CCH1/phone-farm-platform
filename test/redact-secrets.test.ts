import { describe, it, expect } from 'vitest';
import { redactSecrets } from '../src/components/design/_redact';

/**
 * TASK §24 / §8.3 — la consola NO debe filtrar secretos.
 * `redactSecrets` se aplica en TerminalLogs al renderizar.
 *
 * Cobertura mínima:
 *   api_key= / apikey= / access_token= / token= / password= / secret=
 *   case-insensitive, separador `=` o `:`, valor >= 6 chars alfanum.
 */

describe('redactSecrets (TASK §8.3 / §24)', () => {
  it('redacta api_key=xxx', () => {
    expect(redactSecrets('connecting api_key=abcd1234efgh now')).toBe('connecting api_key=[REDACTED] now');
  });
  it('redacta apikey=xxx sin separador intermedio', () => {
    expect(redactSecrets('apikey: mySecret_12345')).toBe('apikey=[REDACTED]');
  });
  it('redacta token=xxx case-insensitive', () => {
    expect(redactSecrets('TOKEN=ABCDEF123456')).toBe('TOKEN=[REDACTED]');
  });
  it('redacta password:xxx', () => {
    expect(redactSecrets('user password: hunter2hunter2 ok')).toBe('user password=[REDACTED] ok');
  });
  it('redacta secret:xxx y access_token=xxx', () => {
    expect(redactSecrets('secret=jwt.1234567890')).toBe('secret=[REDACTED]');
    expect(redactSecrets('access_token=ghp_1234567890abcdefghij')).toBe('access_token=[REDACTED]');
  });
  it('NO redacta cadenas < 6 chars (probablemente no son secretos)', () => {
    expect(redactSecrets('password=ab')).toBe('password=ab');
    expect(redactSecrets('token=short')).toBe('token=short');
  });
  it('NO redacta cuando el valor no es alfanum/underscore/dash (parece otra cosa)', () => {
    expect(redactSecrets('api_key=hello world how are you')).toBe('api_key=hello world how are you');
  });
  it('redacta múltiples ocurrencias en el mismo string', () => {
    expect(redactSecrets('api_key=first123 second=abc token=def456ghi'))
      .toBe('api_key=[REDACTED] second=abc token=[REDACTED]');
  });
  it('preserva cadena vacía o tipo inválido', () => {
    expect(redactSecrets('')).toBe('');
  });
  it('preserva el log completo si no hay coincidencias', () => {
    expect(redactSecrets('[INFO] [mq] started task 42')).toBe('[INFO] [mq] started task 42');
  });
});