// ===== Questions: add (stores options for MCQ/TF; letter A-D for MCQ correct) =====
async function addQuestion(quizId, type, text, correct, options = null) {
  try {
    if (!quizId) return alert("Missing quizId in URL (?quiz=...)");

    const cleanType = String(type || "").trim();
    const cleanText = String(text || "").trim();
    let cleanCorrect = String(correct || "").trim();

    if (!cleanType || !cleanText) {
      return alert("Question type and text are required.");
    }

    let optionsPayload = null;

    if (cleanType === "mcq") {
      // Require exactly 4 options
      if (!Array.isArray(options)) {
        return alert("Please provide all four options for MCQ.");
      }
      optionsPayload = options.map((o) => String(o || "").trim());
      if (optionsPayload.length !== 4 || optionsPayload.some((o) => !o)) {
        return alert("Please provide all four options for MCQ.");
      }

      // Normalize correct to a LETTER (A-D)
      const LETTERS = ["A", "B", "C", "D"];
      if (/^[A-Da-d]$/.test(cleanCorrect)) {
        cleanCorrect = cleanCorrect.toUpperCase();
      } else {
        // If teacher typed the option TEXT, map it to its letter
        const idx = optionsPayload.findIndex(
          (o) => o.toLowerCase() === cleanCorrect.toLowerCase()
        );
        if (idx === -1) {
          return alert(
            "For MCQ, set Correct Answer to A/B/C/D or type the exact option text."
          );
        }
        cleanCorrect = LETTERS[idx];
      }
    } else if (cleanType === "tf") {
      // True/False: store implicit options + normalize correct
      optionsPayload = ["true", "false"];
      const lc = cleanCorrect.toLowerCase();
      if (lc !== "true" && lc !== "false") {
        return alert(
          'For True/False, set Correct Answer to "true" or "false".'
        );
      }
      cleanCorrect = lc;
    } else if (cleanType === "essay") {
      // Essay has no options or correct answer
      cleanCorrect = null;
      optionsPayload = null;
    } else {
      return alert("Unsupported question type.");
    }

    const payload = {
      quiz_id: quizId,
      type: cleanType,
      prompt: cleanText,
      correct_answer: cleanCorrect,
      ...(optionsPayload ? { options: optionsPayload } : {}),
    };

    const { error } = await client.from("questions").insert([payload]);
    if (error) {
      console.error("Supabase insert error:", error);
      return alert(
        "Failed to add question: " + (error.message || JSON.stringify(error))
      );
    }

    alert("Question added!");

    // Clear form fields if present on this page
    const qt = document.getElementById("questionText");
    const ca = document.getElementById("correctAnswer");
    if (qt) qt.value = "";
    if (ca) ca.value = "";
    [0, 1, 2, 3].forEach((i) => {
      const el = document.getElementById("opt" + i);
      if (el) el.value = "";
    });
    document
      .querySelectorAll('input[name="mcqCorrect"]')
      .forEach((r) => (r.checked = false));
  } catch (e) {
    console.error("addQuestion crashed:", e);
    alert("Unexpected error: " + e.message);
  }
}
