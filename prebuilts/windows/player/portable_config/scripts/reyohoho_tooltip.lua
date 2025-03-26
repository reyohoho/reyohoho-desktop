local assdraw = require 'mp.assdraw'
local timer = nil

function show_tooltip()
    local osd_w, osd_h = mp.get_osd_size()
    local ass = assdraw.ass_new()
    ass:append("{\\an7\\fs20\\bord1\\shad0\\pos(15,50)}F2 Blur\\N\\NF3 Audio Compressor\\N\\NF4 Mirror")
    mp.set_osd_ass(osd_w, osd_h, ass.text)

    if timer then
        timer:kill()
    end

    timer = mp.add_timeout(1, function()
        hide_tooltip()
    end)
end

function hide_tooltip()
    local osd_w, osd_h = mp.get_osd_size()
    mp.set_osd_ass(osd_w, osd_h, "")
end

mp.observe_property("mouse-pos", "native", function(_, pos)
    if pos then
        show_tooltip()
    end
end)
