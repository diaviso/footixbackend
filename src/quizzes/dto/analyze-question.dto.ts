import { IsNotEmpty, IsString, IsArray, ValidateNested, IsBoolean, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

class OptionToAnalyze {
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsBoolean()
  isCorrect: boolean;

  @IsString()
  @IsOptional()
  explanation?: string;
}

export class AnalyzeQuestionDto {
  @IsString()
  @IsNotEmpty()
  quizId: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OptionToAnalyze)
  options: OptionToAnalyze[];
}

export interface SpellingCorrection {
  original: string;
  corrected: string;
  hasCorrections: boolean;
  corrections: {
    field: 'content' | 'option';
    optionIndex?: number;
    original: string;
    corrected: string;
    explanation?: string;
  }[];
}

export interface SimilarQuestion {
  id: string;
  content: string;
  similarityScore: number;
  type?: string;
  options?: { content: string; isCorrect: boolean }[];
}

export interface AnalysisResult {
  spelling: SpellingCorrection;
  redundancy: {
    hasSimilarQuestions: boolean;
    similarQuestions: SimilarQuestion[];
  };
}
