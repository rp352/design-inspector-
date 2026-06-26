import type { SemanticCategory, ElementClassification } from './classifier';
import type { InspectorContext } from './modules';

export interface InspectorModule {
  id: string;
  title: string;
  order: number;
  supportedCategories: SemanticCategory[];
  match?: (classification: ElementClassification) => boolean;
  render: (context: InspectorContext) => React.ReactNode;
}

export class ModuleRegistry {
  private modules: InspectorModule[] = [];

  registerModule(mod: InspectorModule) {
    if (!this.modules.some(m => m.id === mod.id)) {
      this.modules.push(mod);
    }
  }

  getModulesForClassification(classification: ElementClassification): InspectorModule[] {
    return this.modules
      .filter(mod => {
        if (mod.match) {
          return mod.match(classification);
        }
        return mod.supportedCategories.includes(classification.type);
      })
      .sort((a, b) => a.order - b.order);
  }

  getAllModules(): InspectorModule[] {
    return [...this.modules].sort((a, b) => a.order - b.order);
  }
}

export const moduleRegistryInstance = new ModuleRegistry();
