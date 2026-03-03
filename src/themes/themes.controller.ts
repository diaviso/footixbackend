import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ThemesService } from './themes.service';
import { CreateThemeDto } from './dto/create-theme.dto';
import { UpdateThemeDto } from './dto/update-theme.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('themes')
export class ThemesController {
  constructor(private readonly themesService: ThemesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  create(@Body() createThemeDto: CreateThemeDto) {
    return this.themesService.create(createThemeDto);
  }

  @Get()
  findAll(@Query('active') active?: string) {
    const activeOnly = active === 'true';
    return this.themesService.findAll(activeOnly);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.themesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() updateThemeDto: UpdateThemeDto) {
    return this.themesService.update(id, updateThemeDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.themesService.remove(id);
  }

  @Patch(':id/reorder-quizzes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  reorderQuizzes(
    @Param('id') themeId: string,
    @Body() body: { quizIds: string[] },
  ) {
    return this.themesService.reorderQuizzes(themeId, body.quizIds);
  }
}
