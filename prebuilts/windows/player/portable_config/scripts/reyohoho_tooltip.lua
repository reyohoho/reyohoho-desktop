local assdraw = require 'mp.assdraw'
local timer = nil  -- Таймер для авто-скрытия

-- Функция отображения tooltip
function show_tooltip()
    local osd_w, osd_h = mp.get_osd_size()
    local ass = assdraw.ass_new()
    ass:append("{\\an7\\fs30\\bord1\\shad0\\pos(10,10)}F2 - Blur::F3 - Compressor::F4 - Mirror")
    mp.set_osd_ass(osd_w, osd_h, ass.text)

    -- Сброс старого таймера (если есть)
    if timer then
        timer:kill()
    end

    -- Запускаем новый таймер на 2 секунды для скрытия tooltip
    timer = mp.add_timeout(2, function()
        hide_tooltip()
    end)
end

-- Функция скрытия tooltip
function hide_tooltip()
    local osd_w, osd_h = mp.get_osd_size()
    mp.set_osd_ass(osd_w, osd_h, "")
end

-- Привязка события к движению мыши
mp.observe_property("mouse-pos", "native", function(_, pos)
    if pos then
        show_tooltip()
    end
end)
