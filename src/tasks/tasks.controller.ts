import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { ReviewTaskDto } from './dto/review-task.dto';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @ApiOperation({ summary: "List the caller's company tasks, optionally filtered by status" })
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryTasksDto) {
    return this.tasksService.findAllForCompany(user.companyId, query);
  }

  @ApiOperation({ summary: 'Accept or reject an LLM-generated task (one-shot; 409 if already reviewed)' })
  @Post(':id/review')
  review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReviewTaskDto,
  ) {
    return this.tasksService.review(id, user.companyId, user.userId, dto.decision);
  }
}
