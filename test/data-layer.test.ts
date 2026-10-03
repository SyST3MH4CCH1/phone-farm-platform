import { describe, it, expect } from 'vitest';
import {
  buildCurl, flattenOpenApi, mapAccount, mapAccounts, mapDevices, mapLogs, mapProxy,
  mapPublications, mapQueue, mapQueueJob, mapStats, publishedOn, sampleBodyFromSchema,
  summarizePipeline, toEpochMs, upcomingWithin,
} from '../src/data/mappers';

describe('TASK §23 — mappers DTO → view model', () => {
  describe('toEpochMs', () => {
    it('acepta ISO, epoch en segundos y epoch en milisegundos', () => {
      expect(toEpochMs('2026-01-02T03:04:05Z')).toBe(Date.parse('2026-01-02T03:04:05Z'));
      expect(toEpochMs(1767322000)).toBe(1767322000000);
      expect(toEpochMs(1767322000000)).toBe(1767322000000);
    });
    it('devuelve null en lugar de NaN cuando el valor no es una fecha', () => {
      expect(toEpochMs(null)).toBeNull();
      expect(toEpochMs(undefined)).toBeNull();
      expect(toEpochMs('no-es-fecha')).toBeNull();
      expect(toEpochMs(Number.NaN)).toBeNull();
    });
  });

  describe('mapStats', () => {
    it('no rellena métricas ausentes: las deja en null y las lista en missing', () => {
      const vm = mapStats({ videos_subidos: 12, cpu_percent: 43.5 });
      expect(vm.videosSubidos).toBe(12);
      expect(vm.cpuPercent).toBe(43.5);
      expect(vm.ramPercent).toBeNull();
      expect(vm.activeBots).toBeNull();
      expect(vm.missing).toContain('ram_percent');
      expect(vm.missing).toContain('active_bots');
    });

    it('tolera un payload totalmente vacío sin lanzar', () => {
      const vm = mapStats({});
      expect(vm.videosSubidos).toBeNull();
      expect(vm.pandaGridStatus).toBeNull();
      expect(vm.missing).toHaveLength(7);
    });

    it('rechaza valores no numéricos en lugar de coerciarlos a 0', () => {
      const vm = mapStats({ errores: 'muchos' } as never);
      expect(vm.errores).toBeNull();
    });
  });

  describe('mapAccount', () => {
    it('mapea el estado real a label/kind sin inventar salud', () => {
      const vm = mapAccount({ id: 'a1', status: 'warmup', device_serial: 'X', proxy_id: 'p1' });
      expect(vm.statusLabel).toBe('Calentando');
      expect(vm.statusKind).toBe('warn');
      expect(vm.health).toBe('warn');
    });

    it('degrada a "Desconocido" si el backend envía un estado desconocido', () => {
      const vm = mapAccount({ id: 'a1', status: 'hibernando' });
      expect(vm.statusRaw).toBe('hibernando');
      expect(vm.statusLabel).toBe('Desconocido');
      expect(vm.statusKind).toBe('unknown');
    });

    it('una cuenta activa sin device_serial se marca degradada, no "ok"', () => {
      const vm = mapAccount({ id: 'a1', status: 'active', proxy_id: 'p1' });
      expect(vm.hasDevice).toBe(false);
      expect(vm.health).toBe('warn');
    });

    it('deja en null las métricas sociales que no llegan', () => {
      const vm = mapAccount({ id: 'a1' });
      expect(vm.followersCount).toBeNull();
      expect(vm.engagementRate).toBeNull();
      expect(vm.likesToday).toBeNull();
    });

    it('descarta entradas sin id en vez de renderizar una fila rota', () => {
      expect(mapAccounts([{ id: 'a1' }, {} as never, null as never])).toHaveLength(1);
      expect(mapAccounts(undefined)).toEqual([]);
    });
  });

  describe('mapProxy', () => {
    it('un proxy sin status declarado queda "Sin estado", nunca "online"', () => {
      const vm = mapProxy({ id: 'p1', host: 'h', port: 1080 });
      expect(vm.status).toBe('unknown');
      expect(vm.statusLabel).toBe('Sin estado');
    });

    it('reporta si hay credenciales completas sin exponerlas', () => {
      expect(mapProxy({ id: 'p', user: 'u', pass: 'p' }).hasCredentials).toBe(true);
      expect(mapProxy({ id: 'p', user: 'u' }).hasCredentials).toBe(false);
      expect(JSON.stringify(mapProxy({ id: 'p', user: 'u', pass: 'p' }))).not.toContain('"p","pass"');
    });
  });

  describe('mapQueueJob', () => {
    it('usa la barra canónica del estado cuando el backend no manda progress', () => {
      expect(mapQueueJob({ id: 'j', status: 'scripting' }).progressPercent).toBe(30);
      expect(mapQueueJob({ id: 'j', status: 'published' }).progressPercent).toBe(100);
    });

    it('respeta el progress real cuando existe, acotado a 0–100', () => {
      expect(mapQueueJob({ id: 'j', status: 'generating', progress: 42 }).progressPercent).toBe(42);
      expect(mapQueueJob({ id: 'j', status: 'generating', progress: 250 }).progressPercent).toBe(100);
      expect(mapQueueJob({ id: 'j', status: 'generating', progress: -5 }).progressPercent).toBe(0);
    });

    it('un estado no canónico no rompe el render', () => {
      const vm = mapQueueJob({ id: 'j', status: 'inventado' });
      expect(vm.status).toBe('unknown');
      expect(vm.bucket).toBe('unknown');
      expect(vm.progressPercent).toBe(0);
    });

    it('summarizePipeline cuenta los 6 buckets reales más "unknown"', () => {
      const jobs = mapQueue([
        { id: '1', status: 'pending' },
        { id: '2', status: 'scripting' },
        { id: '3', status: 'ready_for_publish' },
        { id: '4', status: 'published' },
        { id: '5', status: 'failed' },
        { id: '6', status: 'raro' },
      ]);
      const summary = summarizePipeline(jobs);
      expect(summary.find((s) => s.bucket === 'queued')?.count).toBe(1);
      expect(summary.find((s) => s.bucket === 'generating')?.count).toBe(1);
      expect(summary.find((s) => s.bucket === 'unknown')?.count).toBe(1);
      expect(summary.reduce((a, s) => a + s.count, 0)).toBe(6);
    });
  });

  describe('mapDevices', () => {
    it('solo cuenta seriales reales y marca online según el estado ADB', () => {
      const devs = mapDevices({ devices: [
        { serial: 'RFCW80ABC', state: 'device' },
        { serial: 'OFFLINE1', state: 'offline' },
        { serial: '', state: 'device' },
        { state: 'device' },
      ] });
      expect(devs).toHaveLength(2);
      expect(devs[0].isOnline).toBe(true);
      expect(devs[0].stateKind).toBe('ok');
      expect(devs[1].isOnline).toBe(false);
      expect(devs[1].stateKind).toBe('danger');
    });

    it('sin campo devices devuelve lista vacía, no un error', () => {
      expect(mapDevices(null)).toEqual([]);
      expect(mapDevices({})).toEqual([]);
    });
  });

  describe('mapLogs', () => {
    it('ordena por severidad con un rank explícito', () => {
      const logs = mapLogs([
        { message: 'a', level: 'DEBUG' },
        { message: 'b', level: 'ERROR' },
        { message: 'c', level: 'WARN' },
        { message: 'd', level: 'INFO' },
      ]);
      expect(logs.map((l) => l.level).sort((x, y) => x.localeCompare(y))).toEqual(['DEBUG', 'ERROR', 'INFO', 'WARN']);
      expect(logs.find((l) => l.message === 'b')!.levelRank).toBe(0);
    });

    it('un nivel desconocido se marca UNKNOWN en vez de colarse como INFO', () => {
      expect(mapLogs([{ message: 'x', level: 'TRACE' }])[0].level).toBe('UNKNOWN');
      expect(mapLogs([{ message: 'x' }])[0].level).toBe('UNKNOWN');
    });
  });

  describe('publicaciones', () => {
    const day = (h: number) => Date.parse(`2026-03-04T${String(h).padStart(2, '0')}:00:00Z`);

    it('"publicadas hoy" solo cuenta las que tienen published_at real', () => {
      const pubs = mapPublications([
        { id: 'p1', status: 'published', published_at: '2026-03-04T10:00:00Z' },
        { id: 'p2', status: 'published' },
        { id: 'p3', status: 'draft', published_at: '2026-03-04T11:00:00Z' },
      ]);
      // El timestamp es la fuente de verdad del evento: p3 cuenta aunque su
      // etiqueta diga "draft" (dato inconsistente del backend, no se oculta).
      const counted = publishedOn(pubs, day(0), day(24));
      expect(counted.map((p) => p.id)).toEqual(['p1', 'p3']);
      // p2 dice "published" pero no tiene published_at → NO se cuenta.
      expect(pubs[1].hasPublishedAt).toBe(false);
      expect(counted.some((p) => p.id === 'p2')).toBe(false);
    });

    it('un published_at fuera de la ventana de hoy no se cuenta', () => {
      const pubs = mapPublications([{ id: 'ayer', published_at: '2026-03-03T23:00:00Z' }]);
      expect(publishedOn(pubs, day(0), day(24))).toEqual([]);
    });

    it('"próximas 24h" usa scheduled_time real y ordena cronológicamente', () => {
      const pubs = mapPublications([
        { id: 'b', scheduled_time: '2026-03-04T20:00:00Z' },
        { id: 'a', scheduled_time: '2026-03-04T08:00:00Z' },
        { id: 'c', scheduled_time: '2026-03-20T08:00:00Z' },
        { id: 'd' },
      ]);
      const soon = upcomingWithin(pubs, day(0), 24 * 3600 * 1000);
      expect(soon.map((p) => p.id)).toEqual(['a', 'b']);
    });

    it('sin plataforma declarada muestra "Sin plataforma", no un valor inventado', () => {
      expect(mapPublications([{ id: 'p' }])[0].platformLabel).toBe('Sin plataforma');
      expect(mapPublications([{ id: 'p', platform: 'instagram' }])[0].platformLabel).toBe('Instagram');
    });
  });

  describe('OpenAPI (TASK §16)', () => {
    const accountCreateSchema = {
      type: 'object',
      properties: {
        username: { type: 'string' },
        warmup_day: { type: 'integer' },
        platform: { type: 'string', enum: ['instagram', 'tiktok'] },
      },
      required: ['username'],
    };

    const doc = {
      openapi: '3.1.0',
      info: { title: 't', version: '1' },
      paths: {
        '/api/accounts': {
          get: {
            operationId: 'getAccounts', summary: 'Consultar accounts', tags: ['accounts'],
            security: [{ sessionCookie: [] }],
            responses: { '200': { description: 'ok' } },
            'x-panel-role': null, 'x-panel-validated': false,
          },
          post: {
            operationId: 'postAccounts', summary: 'Crear/accionar accounts', tags: ['accounts'],
            security: [{ sessionCookie: [] }, { csrfHeader: [] }],
            requestBody: { required: true, content: { 'application/json': { schema: accountCreateSchema } } },
            responses: { '200': { description: 'ok' }, '429': { description: 'rate' } },
            'x-panel-role': 'admin', 'x-panel-validated': true,
          },
        },
        '/api/queue/{id}/approve': {
          post: {
            operationId: 'postApprove', summary: 's', tags: ['queue'],
            parameters: [{ name: 'id', in: 'path', required: true }],
            security: [{ sessionCookie: [] }, { csrfHeader: [] }],
            responses: { '200': { description: 'ok' }, '403': { description: 'admin' } },
            'x-panel-role': 'admin', 'x-panel-validated': false,
          },
        },
      },
    } as never;

    it('aplana paths × methods y ordena de forma estable', () => {
      const ops = flattenOpenApi(doc);
      expect(ops.map((o) => o.key)).toEqual([
        'GET /api/accounts',
        'POST /api/accounts',
        'POST /api/queue/{id}/approve',
      ]);
    });

    it('deriva método, CSRF, sesión, rol y rate limit de la seguridad real', () => {
      const ops = flattenOpenApi(doc);
      const create = ops.find((o) => o.key === 'POST /api/accounts')!;
      expect(create.needsSession).toBe(true);
      expect(create.needsCsrf).toBe(true);
      expect(create.roleRequired).toBe('admin');
      expect(create.rateLimited).toBe(true);
      expect(create.methodKind).toBe('write');
      expect(create.pathParams).toEqual([]);

      const approve = ops.find((o) => o.key === 'POST /api/queue/{id}/approve')!;
      expect(approve.pathParams).toEqual(['id']);
      const read = ops.find((o) => o.key === 'GET /api/accounts')!;
      expect(read.methodKind).toBe('read');
      expect(read.needsCsrf).toBe(false);
    });

    it('un documento ausente o corrupto devuelve lista vacía, no revienta', () => {
      expect(flattenOpenApi(null)).toEqual([]);
      expect(flattenOpenApi({} as never)).toEqual([]);
    });

    it('el body de ejemplo sale del JSON Schema real, con placeholders', () => {
      const ops = flattenOpenApi(doc);
      const body = JSON.parse(ops.find((o) => o.key === 'POST /api/accounts')!.sampleBody!);
      expect(body).toEqual({ username: '<username>', warmup_day: 0, platform: 'instagram' });
    });

    it('sampleBodyFromSchema devuelve null si no hay propiedades', () => {
      expect(sampleBodyFromSchema(undefined)).toBeNull();
      expect(sampleBodyFromSchema({ type: 'object', properties: {} })).toBeNull();
    });

    it('buildCurl usa la plantilla real y no inventa un token de sesión', () => {
      const op = flattenOpenApi(doc).find((o) => o.key === 'POST /api/queue/{id}/approve')!;
      const curl = buildCurl(op, 'http://127.0.0.1:3000', { id: 'job_7' }, null);
      expect(curl).toContain('http://127.0.0.1:3000/api/queue/job_7/approve');
      expect(curl).toContain('X-CSRF-Token: $CSRF_TOKEN');
      expect(curl).toContain('cookies.txt');
    });

    it('sin valor de path param deja el placeholder visible en vez de omitirlo', () => {
      const op = flattenOpenApi(doc).find((o) => o.key === 'POST /api/queue/{id}/approve')!;
      expect(buildCurl(op, 'http://x', {}, null)).toContain('<id>');
    });
  });
});
