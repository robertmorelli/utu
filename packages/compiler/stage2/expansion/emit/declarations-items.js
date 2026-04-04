import { ModuleExpander } from '../module-expander.js';
import { installMixin } from '../mixin.js';
import { emitStage253Item } from '../../../e2_5_3_items.js';

class DeclarationItemsMixin {
    emitItem(node, ctx, inModule) {
        return emitStage253Item(this, node, ctx, inModule);
    }
}

installMixin(ModuleExpander, DeclarationItemsMixin);
