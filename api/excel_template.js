const ExcelJS = require("exceljs");
const { getSupabase } = require("./_utils");

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Метод не поддерживается" }));
      return;
    }

    const supabase = getSupabase();
    let teams = [];
    let error = null;
    const withActive = await supabase
      .from("teams")
      .select("name,is_active")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (withActive.error) {
      const fallback = await supabase
        .from("teams")
        .select("name")
        .order("name", { ascending: true });
      teams = fallback.data || [];
      error = fallback.error;
    } else {
      teams = withActive.data || [];
    }
    if (error) {
      throw error;
    }

    const workbook = new ExcelJS.Workbook();
    const dataSheet = workbook.addWorksheet("Оценки", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    const listSheet = workbook.addWorksheet("Lists");

    dataSheet.columns = [
      { header: "Команда/Проект", key: "team", width: 40 },
      { header: "ИТОГО", key: "total", width: 14 },
    ];
    dataSheet.getCell("A1").value = "Оценки экспертов (шаблон)";
    dataSheet.getCell("A2").value = "Команда/Проект";
    dataSheet.getCell("B2").value = "ИТОГО";

    listSheet.columns = [{ header: "", key: "name", width: 40 }];

    const teamNames = (teams || []).map((team) => team.name);
    teamNames.forEach((name, index) => {
      listSheet.getCell(`A${index + 1}`).value = name;
    });

    const lastRow = Math.max(1, teamNames.length);
    const formula = `Lists!$A$1:$A$${lastRow}`;
    for (let row = 3; row <= 500; row += 1) {
      const cell = dataSheet.getCell(`A${row}`);
      cell.dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [formula],
        showErrorMessage: true,
        errorTitle: "Недопустимое значение",
        error: "Выберите команду из списка.",
      };
      dataSheet.getCell(`B${row}`).numFmt = "0.00";
    }

    listSheet.state = "hidden";

    const buffer = await workbook.xlsx.writeBuffer();
    res.statusCode = 200;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=\"tikunlab_template.xlsx\""
    );
    res.end(Buffer.from(buffer));
  } catch (error) {
    console.error("[excel_template]", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: false,
        error: "EXCEL_TEMPLATE_FAILED",
        details: error && error.message ? error.message : "Unknown error",
      })
    );
  }
};
