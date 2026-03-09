// Importing TextComp from kaplay types
import TextComp from 'kaplay/types';

// Updated return type for label objects
const lbl: GameObj<TextComp> = k.add('label', {...});

// Other logic remains unchanged

// Updating BtnEntry and MacroEntry lbl types accordingly
const BtnEntry = (props: BtnProps): GameObj<TextComp> => { ... };
const MacroEntry = (props: MacroProps): GameObj<TextComp> => { ... };