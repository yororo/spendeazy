import { DynamicModule, Module } from '@nestjs/common';
import { CATEGORY_RULE_CATEGORY_STORE } from './application/category-rule-category-store';
import { CATEGORY_RULE_STORE } from './application/category-rule-store';
import { CategoryRulesService } from './application/category-rules.service';
import { TypeOrmCategoryRuleCategoryStore } from './infrastructure/typeorm-category-rule-category-store';
import { TypeOrmCategoryRuleStore } from './infrastructure/typeorm-category-rule-store';
import { CategoryRulesController } from './presentation/category-rules.controller';
import { CategoryRuleReplacementController } from './presentation/category-rule-replacement.controller';

const controllers = [
  CategoryRulesController,
  CategoryRuleReplacementController,
];

@Module({})
export class CategoryRulesModule {
  static register(
    databaseIsConfigured: boolean,
    options: { includeControllers?: boolean } = {},
  ): DynamicModule {
    if (!databaseIsConfigured) {
      if (!options.includeControllers) {
        return { module: CategoryRulesModule };
      }

      return {
        module: CategoryRulesModule,
        controllers,
        providers: [{ provide: CategoryRulesService, useValue: {} }],
      };
    }

    return {
      module: CategoryRulesModule,
      controllers,
      providers: [
        TypeOrmCategoryRuleStore,
        { provide: CATEGORY_RULE_STORE, useExisting: TypeOrmCategoryRuleStore },
        TypeOrmCategoryRuleCategoryStore,
        {
          provide: CATEGORY_RULE_CATEGORY_STORE,
          useExisting: TypeOrmCategoryRuleCategoryStore,
        },
        CategoryRulesService,
      ],
    };
  }
}
