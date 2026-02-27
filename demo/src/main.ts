import { registerStepperDemo } from './registry'
import { bubbleSortStepperSetup } from './demos/bubble-sort'
import { bfsStepperSetup } from './demos/bfs'
import { treeStepperSetup } from './demos/tree'
import { stackStepperSetup } from './demos/stack'
import { linkedListStepperSetup } from './demos/linked-list'
import { minStackStepperSetup } from './demos/min-stack'
import { stepperSortSetup } from './demos/stepper-sort'
import { textAnimationsStepperSetup } from './demos/text-animations'
import { rbTreeStepperSetup } from './demos/rb-tree-stepper'

registerStepperDemo('文字动画', 'text-animations', textAnimationsStepperSetup)
registerStepperDemo('冒泡排序', 'bubble-sort', bubbleSortStepperSetup)
registerStepperDemo('BFS 图遍历', 'bfs', bfsStepperSetup)
registerStepperDemo('二叉树遍历', 'tree', treeStepperSetup)
registerStepperDemo('栈操作', 'stack', stackStepperSetup)
registerStepperDemo('链表操作', 'linked-list', linkedListStepperSetup)
registerStepperDemo('最小栈', 'min-stack', minStackStepperSetup)
registerStepperDemo('步进排序', 'stepper-sort', stepperSortSetup)
registerStepperDemo('红黑树操作', 'rb-tree-ops', rbTreeStepperSetup)
