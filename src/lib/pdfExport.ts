import { jsPDF } from 'jspdf';

export interface RecipePdfData {
  recipeName: string;
  categoryName: string;
  versionNumber: number;
  ingredientsByComponent: { componentName: string; rows: { name: string; quantity_g: number; raw_cooked: string }[] }[];
  totals: { calories: number; protein_g: number; carbs_g: number; fat_g: number; fibre_g: number; omega3_g: number; omega6_g: number; sodium_mg: number; added_sugar_g: number };
  parameterScores: { paramName: string; score: number; goalMin: number; goalMax: number }[];
  overallScore: number;
}

function getScoreColor(score: number): string {
  if (score === 100) return '#22c55e';
  if (score >= 50) return '#f97316';
  return '#ef4444';
}

export function downloadRecipePdf(data: RecipePdfData): void {
  const doc = new jsPDF();
  let y = 20;

  doc.setFontSize(18);
  doc.text(data.recipeName, 14, y);
  y += 10;
  doc.setFontSize(11);
  doc.text(`Category: ${data.categoryName}  |  Version: ${data.versionNumber}`, 14, y);
  y += 12;

  doc.setFontSize(12);
  doc.text('Ingredients', 14, y);
  y += 6;
  doc.setFontSize(10);
  for (const section of data.ingredientsByComponent) {
    doc.setFont('helvetica', 'bold');
    doc.text(section.componentName, 14, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    for (const row of section.rows) {
      doc.text(`  ${row.name} — ${row.quantity_g}g (${row.raw_cooked})`, 14, y);
      y += 5;
    }
    y += 2;
  }
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.text('Totals', 14, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  const t = data.totals;
  doc.text(`Calories: ${t.calories.toFixed(0)} kcal  |  Protein: ${t.protein_g.toFixed(1)}g  |  Carbs: ${t.carbs_g.toFixed(1)}g  |  Fat: ${t.fat_g.toFixed(1)}g`, 14, y);
  y += 5;
  doc.text(`Fibre: ${t.fibre_g.toFixed(1)}g  |  Omega-3: ${t.omega3_g.toFixed(2)}g  |  Omega-6: ${t.omega6_g.toFixed(2)}g  |  Sodium: ${t.sodium_mg.toFixed(0)}mg  |  Added Sugar: ${t.added_sugar_g.toFixed(1)}g`, 14, y);
  y += 10;

  doc.setFont('helvetica', 'bold');
  doc.text('Scoring', 14, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  const overallColor = getScoreColor(data.overallScore);
  doc.setTextColor(overallColor);
  doc.text(`Overall score: ${data.overallScore.toFixed(1)}/100`, 14, y);
  doc.setTextColor(0, 0, 0);
  y += 8;
  for (const p of data.parameterScores) {
    const col = getScoreColor(p.score);
    doc.setTextColor(col);
    doc.text(`  ${p.paramName}: ${p.score.toFixed(0)} (goal: ${p.goalMin}–${p.goalMax})`, 14, y);
    doc.setTextColor(0, 0, 0);
    y += 5;
  }

  doc.save(`${data.recipeName.replace(/\s+/g, '_')}_v${data.versionNumber}.pdf`);
}
