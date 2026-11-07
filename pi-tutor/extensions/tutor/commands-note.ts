// Learner-session fixes (spec §2): the model knew none of the tutor's own commands, so it sent a beginner to "open
// your terminal and type python3" and never mentioned /tutor-start. Every turn carries this list, owned by code.
export const COMMANDS_NOTE = [
  "The tutor's own commands, the ones to point the learner to (never to an outside terminal):",
  "- /tutor-start begins the course: a short talk about them, then one project.",
  "- :TutorRun runs their program in a split below the editor; they see the output and type input there; :TutorRun stop stops it.",
  "- :TutorDone <task id> checks a task with its checks and ticks it.",
  '- During a design recipe they say "skip" to skip a step or "/tutor-plan off" to stop.',
].join("\n");

export const WELCOME = "New here? Tell me what you'd like to learn — or type /tutor-start.";
