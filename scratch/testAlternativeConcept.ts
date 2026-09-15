import { classifyDesignRequestIntent } from '@/lib/design/requestIntent';
import { evaluateConceptDiversity } from '@/lib/design/conceptDiversity';
import { generateAlternativeConcept } from '@/lib/genai/alternativeConcept';
import { applyWhatIfChange, generateInitialDesign } from '@/lib/genai/modelAdapter';
import { DesignPreferences, DesignRequirements, LocationInfo, SiteInfo } from '@/types/architectural';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

async function run() {
  const site: SiteInfo = { plotWidth: 40, plotDepth: 60, totalArea: 2400, orientation: 'E', setbacks: { front: 10, rear: 6, left: 4, right: 4 } };
  const location: LocationInfo = { name: 'Kochi, Kerala', city: 'Kochi', country: 'India', lat: 9.9312, lng: 76.2673, climateZone: 'Warm & Humid' };
  const requirements: DesignRequirements = {
    familySize: 4, bedrooms: 3, bathrooms: 2, floors: 2, budgetRange: 'Moderate',
    spaces: { living: true, dining: true, kitchen: true, parkingCars: 1, balcony: false, studyWorkspace: false, storage: false, prayerRoom: false, courtyard: true, guestRoom: false, outdoorGarden: true }
  };
  const preferences: DesignPreferences = { primaryStyle: 'Kerala Traditional', modes: ['climate_adaptive'] };

  assert(classifyDesignRequestIntent('generate another concept') === 'GENERATE_ALTERNATIVE_CONCEPT', 'alternative request classification');
  assert(classifyDesignRequestIntent('make the kitchen 20% larger') === 'MODIFY_CURRENT_DESIGN', 'modification request classification');
  assert(classifyDesignRequestIntent('add another bedroom upstairs') === 'MODIFY_CURRENT_DESIGN', 'bedroom modification remains a delta intent');

  const initial = (await generateInitialDesign(site, location, requirements, preferences)).design;
  const alternative = await generateAlternativeConcept({ site, location, requirements, preferences, currentDesign: initial, sourceVersionId: 'v1' });
  const diversity = evaluateConceptDiversity(initial, alternative.design);
  assert(alternative.design.generationMetadata?.intent === 'GENERATE_ALTERNATIVE_CONCEPT', 'alternative generation metadata supports version persistence');
  assert(alternative.design.generationMetadata?.sourceVersionId === 'v1', 'source version is retained as comparison provenance');
  assert(alternative.design.plot.width === 40 && alternative.design.plot.depth === 60 && alternative.design.plot.orientation === 'E', 'site constraints are preserved');
  assert(alternative.design.floorsCount === 2, 'floor count is preserved');
  assert(alternative.design.rooms.filter((room) => room.category === 'bedroom').length >= 3, 'bedroom requirement is preserved');
  assert(alternative.design.rooms.filter((room) => room.category === 'bathroom').length >= 2, 'bathroom requirement is preserved');
  assert(alternative.design.rooms.some((room) => room.name.toLowerCase().includes('parking')), 'parking requirement is preserved');
  assert(diversity.isMateriallyDifferent, `alternative diversity is material (${diversity.overallScore})`);

  const modification = await applyWhatIfChange(alternative.design, 'make the kitchen 20% larger', 3);
  assert(modification.delta.changeSummary.toLowerCase().includes('kitchen'), 'normal What-If adapter still modifies the active design');
  console.log('Alternative concept test matrix completed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
