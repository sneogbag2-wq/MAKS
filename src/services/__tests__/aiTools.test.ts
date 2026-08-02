import { describe, it, expect, beforeAll } from 'vitest';
import { executeAiTool, getRelevantToolsForQuery } from '../aiTools';
import { initFromArchive } from '../customerService';

describe('queryTransactions tool', () => {
  beforeAll(async () => {
    await initFromArchive();
  });

  it('should find transactions for a specific customer query', async () => {
    const res = await executeAiTool('queryTransactions', {
      transactionType: 'TAHSILAT',
      sortBy: 'LATEST',
      limit: 5
    });

    expect(res).toBeDefined();
  });

  it('should support sales rep summary tool', async () => {
    const res = await executeAiTool('getSalesRepSummary', {});
    expect(res).toHaveProperty('salesReps');
    expect(res.salesReps).toBeInstanceOf(Array);
  });

  it('should execute getFinancialHealthReport tool successfully', async () => {
    const res = await executeAiTool('getFinancialHealthReport', {});
    expect(res).toHaveProperty('healthScore');
    expect(res).toHaveProperty('riskLevel');
    expect(res).toHaveProperty('overdueRatio');
    expect(res).toHaveProperty('actionRecommendation');
  });

  it('should execute getParetoConcentrationAnalysis tool successfully', async () => {
    const res = await executeAiTool('getParetoConcentrationAnalysis', {});
    expect(res).toHaveProperty('salesPareto');
    expect(res).toHaveProperty('debtPareto');
    expect(res.salesPareto).toHaveProperty('isHighRisk');
  });

  it('should execute getCollectionEffectivenessIndex tool successfully', async () => {
    const res = await executeAiTool('getCollectionEffectivenessIndex', {});
    expect(res).toHaveProperty('ceiPercentage');
    expect(res).toHaveProperty('evaluation');
  });

  it('should filter relevant tools dynamically to save token bandwidth', async () => {
    const routineTools = getRelevantToolsForQuery('Ahmet Market bakiyesi ne kadar?');
    const toolNames = routineTools.map(t => t.name);

    expect(toolNames).toContain('searchCustomers');
    expect(toolNames).toContain('getCustomerDetails');
    expect(toolNames).not.toContain('addManualInvoice');
    expect(toolNames).not.toContain('advancedMapAndImportExcel');

    const mutationTools = getRelevantToolsForQuery('5000100015 kodlu müşteriye 1000 TL fatura ekle');
    const mutationNames = mutationTools.map(t => t.name);
    expect(mutationNames).toContain('addManualInvoice');
  });
});
