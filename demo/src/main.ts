import { registerDemo, registerStepperDemo } from './registry'
import { bubbleSortDemo } from './demos/bubble-sort'
import { bfsDemo } from './demos/bfs'
import { treeDemo } from './demos/tree'
import { stackDemo } from './demos/stack'
import { linkedListDemo } from './demos/linked-list'
import { minStackDemo } from './demos/min-stack'
import { stepperSortSetup } from './demos/stepper-sort'
import { textAnimationsDemo } from './demos/text-animations'
import { rbTreeStepperSetup } from './demos/rb-tree-stepper'

registerDemo('文字动画', 'text-animations', textAnimationsDemo)
registerDemo('冒泡排序', 'bubble-sort', bubbleSortDemo)
registerDemo('BFS 图遍历', 'bfs', bfsDemo)
registerDemo('二叉树遍历', 'tree', treeDemo)
registerDemo('栈操作', 'stack', stackDemo)
registerDemo('链表操作', 'linked-list', linkedListDemo)
registerDemo('最小栈', 'min-stack', minStackDemo)
registerStepperDemo('步进排序', 'stepper-sort', stepperSortSetup)
registerStepperDemo('红黑树操作', 'rb-tree-ops', rbTreeStepperSetup)
