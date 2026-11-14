import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import messages from '../../../messages/es.json';
import TerrainSection from './TerrainSection';

/** El drawer pinta el riesgo y el Markov con los datos reales de public/geo y los textos en español. */
const geo = join(process.cwd(), 'public/geo');

beforeAll(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const file = url.startsWith('/geo/') ? join(geo, url.slice('/geo/'.length)) : '';
      return new Response(readFileSync(file, 'utf8'), { status: 200, headers: { 'content-type': 'application/json' } });
    }),
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  // jsdom no mide: las gráficas se dibujan al ancho de un drawer de móvil.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 320, height: 200 } as DOMRect);
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderSection(code: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale="es" messages={messages} timeZone="America/Bogota">
      <QueryClientProvider client={client}>
        <TerrainSection code={code} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('TerrainSection', () => {
  it('muestra el riesgo con evidencia, confianza y vacíos, y el cambio de estado inicial a final', async () => {
    renderSection('44001'); // Riohacha, La Guajira

    const risk = await screen.findByRole('region', { name: 'Zonas de riesgo' });
    for (const name of ['Sequía', 'Encharcamiento', 'Calor', 'Suelo degradado']) expect(within(risk).getByText(name)).toBeInTheDocument();
    expect(within(risk).getByText(/confianza (alta|media|baja)/)).toBeInTheDocument();
    expect(within(risk).getByText('Lo que no sabemos')).toBeInTheDocument();
    expect(within(risk).getAllByRole('button', { name: /en el mapa/ }).length).toBe(4);

    const change = screen.getByRole('region', { name: 'Cómo cambia el terreno' });
    expect(within(change).getByText('2016–2018')).toBeInTheDocument();
    expect(within(change).getByText('2023–2025')).toBeInTheDocument();
    expect(within(change).getByRole('img', { name: /Diagrama de cambios del terreno/ })).toBeInTheDocument();
    expect(within(change).getByText(/Si los cambios siguen igual, hacia 2031/)).toBeInTheDocument();
    expect(within(change).getByText(/no reemplaza tu criterio/)).toBeInTheDocument();

    fireEvent.click(within(change).getByRole('button', { name: 'Ver como tabla' }));
    expect(within(change).getAllByRole('table').length).toBe(2);
  });

  it('un departamento usa su promedio', async () => {
    renderSection('44');
    expect(await screen.findByRole('region', { name: 'Cómo cambia el terreno' })).toBeInTheDocument();
  });

  it('marca los datos sintéticos como simulados', async () => {
    const index = JSON.parse(readFileSync(join(geo, 'terrain-co.json'), 'utf8')) as { source: string };
    renderSection('05001');
    await screen.findByRole('region', { name: 'Zonas de riesgo' });
    expect(screen.queryAllByText('simulado').length > 0).toBe(index.source !== 'gee');
  });
});
