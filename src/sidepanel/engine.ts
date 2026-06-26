import { elementClassificationEngine } from './classifier';
import type { ElementClassification } from './classifier';
import { moduleRegistryInstance } from './registry';
import type { InspectorModule } from './registry';
import type { ElementSelectInfo, ElementHoverInfo } from '../shared/types';

export interface InspectionResult {
  classification: ElementClassification;
  modules: InspectorModule[];
}

export class InspectorEngine {
  inspectElement(el: ElementSelectInfo | ElementHoverInfo): InspectionResult {
    const classification = elementClassificationEngine.classify(el);
    const modules = moduleRegistryInstance.getModulesForClassification(classification);
    return {
      classification,
      modules
    };
  }
}

export const inspectorEngineInstance = new InspectorEngine();
