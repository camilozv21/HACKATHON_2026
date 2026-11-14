/**
 * Fuentes del mock de POST /rotations/outlook. Cada entrada se verificó en una página real (Crossref, la revista,
 * el repositorio de la entidad) en noviembre de 2026; `finding` resume lo que dice la fuente sin redondear ni
 * exagerar. Si se cambia un número del modelo, hay que cambiar también su fuente (ver docs/rotation-outlook.md).
 */
import type { Reference } from '@/lib/api/outlook';

type Entry = Omit<Reference, 'id' | 'finding'> & { finding: { es: string; en: string } };

const doi = (d: string) => `https://doi.org/${d}`;

export const REFERENCES = {
  // ------------------------------------------------------------ rendimiento y suelo en el tiempo
  'zhao-2022': {
    authors: 'Zhao J, Chen J, Beillouin D, Lambers H, Yang Y, Smith P, Zeng Z, Olesen JE, Zang H',
    year: 2022,
    title:
      'Global systematic review with meta-analysis reveals yield advantage of legume-based rotations and its drivers',
    venue: 'Nature Communications 13:4926',
    url: doi('10.1038/s41467-022-32464-0'),
    topic: 'yield',
    finding: {
      es: 'En 462 ensayos de campo, sembrar antes una leguminosa subió 20 % el rendimiento del cultivo principal; la ventaja fue mayor donde se rinde poco (32 %) que donde se rinde mucho (7 %).',
      en: 'Across 462 field experiments, a legume pre-crop raised the main crop’s yield by 20%; the advantage was larger in low-yielding (32%) than high-yielding (7%) settings.',
    },
  },
  'bowles-2020': {
    authors: 'Bowles TM, Mooshammer M, Socolar Y, et al., Grandy AS',
    year: 2020,
    title:
      'Long-Term Evidence Shows that Crop-Rotation Diversification Increases Agricultural Resilience to Adverse Growing Conditions in North America',
    venue: 'One Earth 2(3):284–293',
    url: doi('10.1016/j.oneear.2020.02.007'),
    topic: 'stability',
    finding: {
      es: 'En ensayos de largo plazo, las rotaciones más diversas subieron el rendimiento del maíz 28,1 % en promedio y redujeron las pérdidas en años de sequía entre 14,0 % y 89,9 %.',
      en: 'In long-term trials, more diverse rotations raised maize yields by 28.1% on average and cut losses in drought years by 14.0%–89.9%.',
    },
  },
  'gaudin-2015': {
    authors: 'Gaudin ACM, Tolhurst TN, Ker AP, Janovicek K, Tortora C, Martin RC, Deen W',
    year: 2015,
    title: 'Increasing Crop Diversity Mitigates Weather Variations and Improves Yield Stability',
    venue: 'PLOS ONE 10(2):e0113261',
    url: doi('10.1371/journal.pone.0113261'),
    topic: 'stability',
    finding: {
      es: 'En un ensayo de 31 años en Ontario, en los años calientes y secos las rotaciones diversificadas subieron el rendimiento 7 % en maíz y 22 % en soya.',
      en: 'In a 31-year Ontario trial, in hot and dry years diversified rotations raised yields by 7% (maize) and 22% (soybean).',
    },
  },
  'davis-2012': {
    authors: 'Davis AS, Hill JD, Chase CA, Johanns AM, Liebman M',
    year: 2012,
    title:
      'Increasing Cropping System Diversity Balances Productivity, Profitability and Environmental Health',
    venue: 'PLoS ONE 7(10):e47149',
    url: doi('10.1371/journal.pone.0047149'),
    topic: 'economics',
    finding: {
      es: 'En Iowa (2003–2011), las rotaciones de 3 y 4 años dieron cosechas y ganancias iguales o mayores que maíz–soya, con menos agroquímicos y una toxicidad del agua cien veces menor.',
      en: 'In Iowa (2003–2011), 3- and 4-year rotations gave yields and profit similar to or greater than maize–soybean, with fewer agrichemicals and freshwater toxicity two orders of magnitude lower.',
    },
  },
  'marcillo-miguez-2017': {
    authors: 'Marcillo GS, Miguez FE',
    year: 2017,
    title: 'Corn yield response to winter cover crops: An updated meta-analysis',
    venue: 'Journal of Soil and Water Conservation 72(3):226–239',
    url: doi('10.2489/jswc.72.3.226'),
    topic: 'yield',
    finding: {
      es: 'Las coberturas leguminosas subieron 30–33 % el rendimiento del maíz siguiente cuando se abonaba poco nitrógeno; las coberturas de gramíneas no lo subieron ni lo bajaron.',
      en: 'Legume cover crops raised the following maize yield by 30–33% when nitrogen rates were low; grass covers neither raised nor lowered it.',
    },
  },
  'mcdaniel-2014': {
    authors: 'McDaniel MD, Tiemann LK, Grandy AS',
    year: 2014,
    title:
      'Does agricultural crop diversity enhance soil microbial biomass and organic matter dynamics? A meta-analysis',
    venue: 'Ecological Applications 24(3):560–570',
    url: doi('10.1890/13-0616.1'),
    topic: 'soil-carbon',
    finding: {
      es: 'En 122 estudios, sumar cultivos a un monocultivo subió el carbono del suelo 3,6 %; con una cobertura, 8,5 %. La vida microbiana subió 20,7 %.',
      en: 'Across 122 studies, adding crops to a monoculture raised soil carbon by 3.6%; with a cover crop, by 8.5%. Microbial biomass rose 20.7%.',
    },
  },
  'poeplau-don-2015': {
    authors: 'Poeplau C, Don A',
    year: 2015,
    title: 'Carbon sequestration in agricultural soils via cultivation of cover crops – A meta-analysis',
    venue: 'Agriculture, Ecosystems & Environment 200:33–41',
    url: doi('10.1016/j.agee.2014.10.024'),
    topic: 'soil-carbon',
    finding: {
      es: 'Las coberturas suben el carbono del suelo 0,32 ± 0,08 t por hectárea al año; el suelo tarda unos 155 años en llegar a su nuevo equilibrio. Por eso el cambio es lento.',
      en: 'Cover crops raise soil carbon by 0.32 ± 0.08 t per hectare per year; soil takes about 155 years to reach its new steady state. That is why change is slow.',
    },
  },
  'minasny-2017': {
    authors: 'Minasny B, Malone BP, McBratney AB, et al.',
    year: 2017,
    title: 'Soil carbon 4 per mille',
    venue: 'Geoderma 292:59–86',
    url: doi('10.1016/j.geoderma.2017.01.002'),
    topic: 'soil-carbon',
    finding: {
      es: 'Con buenas prácticas se puede subir el carbono del suelo 4 por mil al año o más; hasta 10 por mil en suelos pobres en carbono y en los primeros 20 años de cambio.',
      en: 'Best practices can raise soil carbon by 4 per mille a year or more; up to 10 per mille in carbon-poor soils and in the first 20 years after the change.',
    },
  },
  'castro-rincon-2018': {
    authors: 'Castro-Rincón E, Mojica-Rodríguez JE, Carulla-Fornaguera JE, Lascano-Aguilar CE',
    year: 2018,
    title:
      'Evaluation of legumes as green manure in forage crops for livestock in the dry Colombian Caribbean',
    venue: 'Agronomía Mesoamericana 29(3):597–617',
    url: doi('10.15517/ma.v29i3.32350'),
    topic: 'colombia',
    finding: {
      es: 'En el Caribe seco colombiano, las leguminosas usadas como abono verde subieron 22 % el carbono orgánico del suelo; el fríjol canavalia aportó hasta 151 kg de nitrógeno por hectárea.',
      en: 'In Colombia’s dry Caribbean, legumes used as green manure raised soil organic carbon by 22%; jack bean supplied up to 151 kg of nitrogen per hectare.',
    },
  },
  // ------------------------------------------------------------ transición y economía
  'pittelkow-2015-fcr': {
    authors: 'Pittelkow CM, Linquist BA, Lundy ME, et al.',
    year: 2015,
    title: 'When does no-till yield more? A global meta-analysis',
    venue: 'Field Crops Research 183:156–168',
    url: doi('10.1016/j.fcr.2015.07.020'),
    topic: 'transition',
    finding: {
      es: 'Al cambiar a labranza cero, el rendimiento bajó los primeros 1–2 años en casi todos los cultivos y se igualó después de 3–10 años: el bache de la transición es real y pasa.',
      en: 'After switching to no-till, yields fell in the first 1–2 years for almost all crops and matched conventional tillage after 3–10 years: the transition dip is real, and it passes.',
    },
  },
  'pittelkow-2015': {
    authors: 'Pittelkow CM, Liang X, Linquist BA, et al., van Kessel C',
    year: 2015,
    title: 'Productivity limits and potentials of the principles of conservation agriculture',
    venue: 'Nature 517:365–368',
    url: doi('10.1038/nature13809'),
    topic: 'transition',
    finding: {
      es: 'La labranza cero sola baja el rendimiento; combinada con dejar el rastrojo y rotar cultivos, el efecto negativo se reduce al mínimo y en climas secos sin riego el rendimiento sube.',
      en: 'No-till alone lowers yields; combined with residue retention and crop rotation the negative effect is minimised, and in dry rainfed climates yields rise.',
    },
  },
  'sare-2019': {
    authors: 'Myers R, Weber A, Tellatin S',
    year: 2019,
    title: 'Cover Crop Economics: Opportunities to Improve Your Bottom Line in Row Crops',
    venue: 'SARE Outreach (boletín técnico)',
    url: 'https://www.sare.org/resources/cover-crop-economics/',
    topic: 'economics',
    finding: {
      es: 'En promedio se necesitan unos tres años sembrando coberturas para recuperar lo invertido o ganar; hacia el quinto año, en la mayoría de los lotes dejan una ganancia modesta.',
      en: 'On average it takes about three years of cover cropping to break even or make a profit; by year five, on most fields, cover crops produce a modest profit.',
    },
  },
  'snapp-2010': {
    authors: 'Snapp SS, Blackie MJ, Gilbert RA, Bezner-Kerr R, Kanyama-Phiri GY',
    year: 2010,
    title: 'Biodiversity can support a greener revolution in Africa',
    venue: 'PNAS 107(48):20840–20845',
    url: doi('10.1073/pnas.1007199107'),
    topic: 'adoption',
    finding: {
      es: 'En Malawi, rotar con leguminosas semiperennes y la mitad del abono dio la misma cosecha de grano, bajó la variación del rendimiento de 22 % a 13 % y duplicó la ganancia; lo que preferían los agricultores coincidió con lo más rentable.',
      en: 'In Malawi, rotating with semi-perennial legumes at half the fertilizer gave the same grain, cut yield variability from 22% to 13% and doubled returns; farmers’ preferences matched profitability.',
    },
  },
  // ------------------------------------------------------------ erosión
  'montgomery-2007': {
    authors: 'Montgomery DR',
    year: 2007,
    title: 'Soil erosion and agricultural sustainability',
    venue: 'PNAS 104(33):13268–13272',
    url: doi('10.1073/pnas.0611508104'),
    topic: 'erosion',
    finding: {
      es: 'En los campos arados, la erosión es de 10 a 100 veces mayor que la formación de suelo (cerca de 1 mm al año); sin arar, se acerca mucho más a lo que el suelo alcanza a formar.',
      en: 'On ploughed fields, erosion is 10 to 100 times greater than soil formation (about 1 mm a year); without ploughing it comes much closer to what soil can form.',
    },
  },
  'rivera-posada-1996': {
    authors: 'Rivera Posada H',
    year: 1996,
    title: 'Por qué no se debe usar el azadón como herramienta de desyerba en sus cafetales',
    venue: 'Avances Técnicos Cenicafé 233',
    url: doi('10.38141/10779/0233'),
    topic: 'colombia',
    finding: {
      es: 'En Chinchiná, un cafetal joven desyerbado con azadón perdió 14,67 t de suelo por hectárea al año; con machete y cobertura de indigofera, 0,61 t. Un centímetro de suelo tarda de 120 a 400 años en formarse.',
      en: 'In Chinchiná, a young coffee plot weeded with a hoe lost 14.67 t of soil per hectare a year; with machete weeding and an indigo cover, 0.61 t. One centimetre of soil takes 120 to 400 years to form.',
    },
  },
  'den-biggelaar-2004': {
    authors: 'den Biggelaar C, Lal R, Wiebe K, Eswaran H, Breneman V, Reich P',
    year: 2004,
    title:
      'The global impact of soil erosion on productivity. II: Effects on crop yields and production over time',
    venue: 'Advances in Agronomy 81:49–95',
    url: doi('10.1016/S0065-2113(03)81002-7'),
    topic: 'erosion',
    finding: {
      es: 'Si las prácticas no cambian, la erosión por agua hace perder en promedio 0,3 % de la producción al año en el mundo.',
      en: 'If practices do not change, water erosion costs on average 0.3% of production per year worldwide.',
    },
  },
  'bakker-2004': {
    authors: 'Bakker MM, Govers G, Rounsevell MDA',
    year: 2004,
    title: 'The crop productivity–erosion relationship: an analysis based on experimental work',
    venue: 'Catena 57(1):55–76',
    url: doi('10.1016/j.catena.2003.07.002'),
    topic: 'erosion',
    finding: {
      es: 'Una pérdida de productividad de alrededor de 4 % por cada 10 cm de suelo perdido es un valor realista (promedio de parcelas comparadas: 4,3 %).',
      en: 'A productivity loss of about 4% per 10 cm of soil lost is realistic (comparative-plot average: 4.3%).',
    },
  },
  'verheijen-2009': {
    authors: 'Verheijen FGA, Jones RJA, Rickson RJ, Smith CJ',
    year: 2009,
    title: 'Tolerable versus actual soil erosion rates in Europe',
    venue: 'Earth-Science Reviews 94(1–4):23–38',
    url: doi('10.1016/j.earscirev.2009.02.003'),
    topic: 'erosion',
    finding: {
      es: 'La erosión tolerable (la que el suelo alcanza a reponer) va de unas 0,3 a 1,4 t por hectárea al año; en tierras aradas la erosión real es de 3 a 40 veces mayor.',
      en: 'Tolerable erosion (what soil formation can replace) is about 0.3 to 1.4 t per hectare a year; on tilled land actual erosion is 3 to 40 times greater.',
    },
  },
  // ------------------------------------------------------------ trabajo
  'dane-2011-jornales': {
    authors: 'DANE, Dirección de Síntesis y Cuentas Nacionales',
    year: 2011,
    title: 'Matriz de empleo en la base 2005 de las cuentas nacionales (Cuadro 5)',
    venue: 'DANE, Bogotá',
    url: 'https://www.dane.gov.co/files/investigaciones/pib/especiales/Documento_matriz_empleo.pdf',
    topic: 'labor',
    finding: {
      es: 'Jornales por hectárea cosechada (año 2005): maíz 37, fríjol 38, papa 104, yuca 100, plátano 108, café 150, caña panelera 204, hortalizas 150. Un empleo agrícola de tiempo completo equivale a 173 jornales al año.',
      en: 'Workdays per harvested hectare (2005): maize 37, beans 38, potato 104, cassava 100, plantain 108, coffee 150, panela sugarcane 204, vegetables 150. One full-time farm job equals 173 workdays a year.',
    },
  },
  'upra-2023-frijol': {
    authors: 'UPRA',
    year: 2023,
    title: 'Costos de producción de fríjol, primer semestre 2023',
    venue: 'Unidad de Planificación Rural Agropecuaria (boletín)',
    url: 'https://upra.gov.co/sites/default/files/2025-04/20231009_BolCostos_Frijol.pdf',
    topic: 'labor',
    finding: {
      es: 'Un ciclo de fríjol pidió entre 48 y 131 jornales por hectárea según la región (Tolima 48, Huila 72, Cundinamarca 72, Norte de Santander 94, oriente antioqueño 131).',
      en: 'One bean cycle needed 48 to 131 workdays per hectare depending on the region (Tolima 48, Huila 72, Cundinamarca 72, Norte de Santander 94, eastern Antioquia 131).',
    },
  },
  'upra-2023-yuca': {
    authors: 'UPRA',
    year: 2023,
    title: 'Costos de producción de yuca, segundo semestre 2023',
    venue: 'Unidad de Planificación Rural Agropecuaria (boletín, Agronet)',
    url: 'https://agronet.gov.co/sites/default/files/2025-11/IISEM_BolCostos_Yuca.pdf',
    topic: 'labor',
    finding: {
      es: 'La yuca pidió entre 53 y 93 jornales por hectárea (centro del Magdalena 53, Ariari 55, sabanas de Sucre 93).',
      en: 'Cassava needed 53 to 93 workdays per hectare (central Magdalena 53, Ariari 55, Sucre savannas 93).',
    },
  },
  // ------------------------------------------------------------ fincas pequeñas, comida y tierra
  'lowder-2021': {
    authors: 'Lowder SK, Sánchez MV, Bertini R',
    year: 2021,
    title: 'Which farms feed the world and has farmland become more concentrated?',
    venue: 'World Development 142:105455',
    url: doi('10.1016/j.worlddev.2021.105455'),
    topic: 'smallholders',
    finding: {
      es: 'Las fincas de menos de 2 hectáreas son el 84 % de las fincas del mundo, trabajan cerca del 12 % de la tierra agrícola y producen alrededor del 35 % de la comida.',
      en: 'Farms under 2 hectares are 84% of the world’s farms, operate around 12% of agricultural land and produce roughly 35% of the food.',
    },
  },
  'ricciardi-2018': {
    authors: 'Ricciardi V, Ramankutty N, Mehrabi Z, Jarvis L, Chookolingo B',
    year: 2018,
    title: 'How much of the world’s food do smallholders produce?',
    venue: 'Global Food Security 17:64–72',
    url: doi('10.1016/j.gfs.2018.05.002'),
    topic: 'smallholders',
    finding: {
      es: 'Las fincas de menos de 2 hectáreas producen 30–34 % de la comida del mundo en el 24 % del área agrícola.',
      en: 'Farms under 2 hectares produce 30–34% of the world’s food supply on 24% of the agricultural area.',
    },
  },
  'dane-cna-2014': {
    authors: 'DANE',
    year: 2016,
    title: '3er Censo Nacional Agropecuario 2014 – Boletín 1: Uso del suelo',
    venue: 'DANE, Bogotá',
    url: 'https://www.dane.gov.co/files/CensoAgropecuario/entrega-definitiva/Boletin-1-Uso-del-suelo/1-Boletin.pdf',
    topic: 'colombia',
    finding: {
      es: 'Las unidades productivas de menos de 5 hectáreas fueron el 70,4 % y ocuparon solo el 2,0 % del área rural censada; las de más de 500 hectáreas (0,4 %) tenían el 77,3 %.',
      en: 'Farm units under 5 hectares were 70.4% and occupied only 2.0% of the surveyed rural area; those over 500 hectares (0.4%) held 77.3%.',
    },
  },
  'dane-cna-2014-envejecimiento': {
    authors: 'DANE',
    year: 2016,
    title: '3er Censo Nacional Agropecuario 2014 – Boletín 3: Viviendas, hogares y personas',
    venue: 'DANE, Bogotá',
    url: 'https://www.dane.gov.co/files/CensoAgropecuario/entrega-definitiva/Boletin-3-Viviendas-hogares-y-personas/3-Boletin.pdf',
    topic: 'labor',
    finding: {
      es: 'En el campo, el índice de envejecimiento fue 51,7 en 2014 (personas de 60 años o más por cada 100 menores de 15); en 2005 era 26,5.',
      en: 'In rural areas the ageing index was 51.7 in 2014 (people aged 60+ per 100 under 15); in 2005 it was 26.5.',
    },
  },
  'dane-cna-2014-productoras': {
    authors: 'DANE',
    year: 2016,
    title: '3er Censo Nacional Agropecuario 2014 – Boletín 2: Productores residentes',
    venue: 'DANE, Bogotá',
    url: 'https://www.dane.gov.co/files/CensoAgropecuario/entrega-definitiva/Boletin-2-Productores-residentes/2-Boletin.pdf',
    topic: 'gender',
    finding: {
      es: 'De 725.225 productores residentes en el campo, el 63,6 % eran hombres y el 36,4 % mujeres.',
      en: 'Of 725,225 resident producers in rural areas, 63.6% were men and 36.4% women.',
    },
  },
  'minagricultura-464-2017': {
    authors: 'Ministerio de Agricultura y Desarrollo Rural de Colombia',
    year: 2017,
    title:
      'Resolución 000464 de 2017: Lineamientos estratégicos de política pública para la Agricultura Campesina, Familiar y Comunitaria',
    venue: 'MinAgricultura (copia en FAOLEX)',
    url: 'https://faolex.fao.org/docs/pdf/col173052.pdf',
    topic: 'colombia',
    finding: {
      es: 'Define la agricultura campesina, familiar y comunitaria (al menos la mitad del trabajo es de la familia o la comunidad) y recuerda que solo el 16,5 % de las unidades productivas tuvo asistencia técnica en 2014.',
      en: 'Defines peasant, family and community farming (at least half the labor is family or community labor) and notes that only 16.5% of farm units had technical assistance in 2014.',
    },
  },
  'vaitla-2009': {
    authors: 'Vaitla B, Devereux S, Swan SH',
    year: 2009,
    title: 'Seasonal Hunger: A Neglected Problem with Proven Solutions',
    venue: 'PLoS Medicine 6(6):e1000101',
    url: doi('10.1371/journal.pmed.1000101'),
    topic: 'food-security',
    finding: {
      es: 'La mayor parte del hambre llega en la «temporada de hambre», cuando se acaba lo guardado de la cosecha anterior, la comida está cara y hay poco trabajo.',
      en: 'Most acute hunger comes in the annual “hunger season”, when last year’s stocks run low, food prices are high and jobs are scarce.',
    },
  },
  'waha-2018': {
    authors: 'Waha K, van Wijk MT, Fritz S, See L, Thornton PK, Wichern J, Herrero M',
    year: 2018,
    title: 'Agricultural diversification as an important strategy for achieving food security in Africa',
    venue: 'Global Change Biology 24(8):3390–3400',
    url: doi('10.1111/gcb.14158'),
    topic: 'food-security',
    finding: {
      es: 'En más de 28.000 hogares de 18 países, las fincas más diversas cubrieron sus necesidades de comida más seguido, aunque solo hasta cierto nivel de diversidad por hectárea.',
      en: 'In more than 28,000 households in 18 countries, more diverse farms met their food needs more often, but only up to a certain level of diversity per hectare.',
    },
  },
  'higgins-2018': {
    authors: 'Higgins D, Balint T, Liversage H, Winters P',
    year: 2018,
    title:
      'Investigating the impacts of increased rural land tenure security: A systematic review of the evidence',
    venue: 'Journal of Rural Studies 61:34–62',
    url: doi('10.1016/j.jrurstud.2018.05.001'),
    topic: 'tenure',
    finding: {
      es: 'En 59 estudios sólidos, tener seguridad sobre la tierra favorece las inversiones productivas y las que cuidan el ambiente, y el empoderamiento de las mujeres.',
      en: 'Across 59 robust studies, secure land tenure favours productive and environmentally beneficial investments, and women’s empowerment.',
    },
  },
  'lawry-2017': {
    authors: 'Lawry S, Samii C, Hall R, Leopold A, Hornby D, Mtero F',
    year: 2017,
    title:
      'The impact of land property rights interventions on investment and agricultural productivity in developing countries: a systematic review',
    venue: 'Journal of Development Effectiveness 9(1):61–81',
    url: doi('10.1080/19439342.2016.1160947'),
    topic: 'tenure',
    finding: {
      es: 'Reconocer los derechos sobre la tierra trajo mejoras grandes de productividad e ingreso, distintas según la región, a través de la sensación de seguridad y la inversión.',
      en: 'Recognising land rights brought substantial productivity and income gains, varying by region, through perceived security and investment.',
    },
  },
  // ------------------------------------------------------------ adopción, aprendizaje y género
  'knowler-bradshaw-2007': {
    authors: 'Knowler D, Bradshaw B',
    year: 2007,
    title: 'Farmers’ adoption of conservation agriculture: A review and synthesis of recent research',
    venue: 'Food Policy 32(1):25–48',
    url: doi('10.1016/j.foodpol.2006.01.003'),
    topic: 'adoption',
    finding: {
      es: 'Casi ningún factor (tamaño de la finca, estudio, tenencia, precios) explica en todas partes quién adopta; el único que podría ser universal es el capital social: las redes y la confianza entre vecinos.',
      en: 'Few if any factors (farm size, education, tenure, prices) explain adoption everywhere; the only possible universal factor may be social capital: networks and trust among neighbours.',
    },
  },
  'prokopy-2019': {
    authors: 'Prokopy LS, Floress K, Arbuckle JG, et al.',
    year: 2019,
    title:
      'Adoption of agricultural conservation practices in the United States: Evidence from 35 years of quantitative literature',
    venue: 'Journal of Soil and Water Conservation 74(5):520–534',
    url: doi('10.2489/jswc.74.5.520'),
    topic: 'adoption',
    finding: {
      es: 'Pocos factores predicen la adopción siempre; ayudan el interés por cuidar la tierra, conocer la práctica y haberla usado antes.',
      en: 'Few variables consistently predict adoption; stewardship motivation, awareness and prior use of the practice help.',
    },
  },
  'waddington-2014': {
    authors: 'Waddington H, Snilstveit B, Hombrados J, Vojtkova M, Phillips D, Davies P, White H',
    year: 2014,
    title: 'Farmer Field Schools for Improving Farming Practices and Farmer Outcomes: A Systematic Review',
    venue: 'Campbell Systematic Reviews 10(1)',
    url: doi('10.4073/csr.2014.6'),
    topic: 'adoption',
    finding: {
      es: 'Las escuelas de campo subieron en promedio 13 % el rendimiento y 20 % el ingreso, sobre todo en proyectos piloto de corto plazo.',
      en: 'Farmer field schools raised yields by 13% and income by 20% on average, mostly in short-term pilot projects.',
    },
  },
  'fao-2023-women': {
    authors: 'FAO',
    year: 2023,
    title: 'The status of women in agrifood systems',
    venue: 'FAO, Roma',
    url: doi('10.4060/cc5343en'),
    topic: 'gender',
    finding: {
      es: 'En el trabajo agrícola asalariado, las mujeres ganan 82 centavos por cada dólar que gana un hombre, y en fincas del mismo tamaño hay una brecha de productividad de 24 % entre mujeres y hombres.',
      en: 'In agricultural wage work, women earn 82 cents for every dollar men earn, and on farms of equal size there is a 24% productivity gap between women and men.',
    },
  },
  // ------------------------------------------------------------ cultivos asociados
  'yu-2015': {
    authors: 'Yu Y, Stomph T-J, Makowski D, van der Werf W',
    year: 2015,
    title:
      'Temporal niche differentiation increases the land equivalent ratio of annual intercrops: A meta-analysis',
    venue: 'Field Crops Research 184:133–144',
    url: doi('10.1016/j.fcr.2015.09.010'),
    topic: 'intercropping',
    finding: {
      es: 'En promedio, sembrar cultivos asociados rinde como 1,22 hectáreas de cultivos solos por cada hectárea (LER 1,22).',
      en: 'On average, intercrops yield like 1.22 hectares of sole crops per hectare (LER 1.22).',
    },
  },
} satisfies Record<string, Entry>;

export type RefId = keyof typeof REFERENCES;

/** Las fuentes citadas, en el orden en que aparecen, con el texto en el idioma pedido. */
export function referencesFor(ids: string[], l: 'es' | 'en'): Reference[] {
  const seen = new Set<string>();
  const out: Reference[] = [];
  for (const id of ids) {
    if (seen.has(id) || !(id in REFERENCES)) continue;
    seen.add(id);
    const e = REFERENCES[id as RefId] as Entry;
    out.push({ id, ...e, finding: e.finding[l] });
  }
  return out;
}
