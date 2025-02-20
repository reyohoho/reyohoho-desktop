function toggle_hflip()
    local filters = mp.get_property("vf")
    if string.match(filters, "hflip") then
        mp.command("vf remove hflip")
        mp.osd_message("Flip: OFF")
    else
        mp.command("vf add hflip")
        mp.osd_message("Flip: ON")
    end
end

function toggle_blur()
    local filters = mp.get_property("vf")
    local w, h = mp.get_property_native("width"), mp.get_property_native("height")
    local sigma = 0
    if h > 1080 then
        sigma = 70
    else
        sigma = 30
    end
    if string.match(filters, "sigma") then
        mp.commandv("vf", "remove", "gblur=sigma=" .. sigma)
        mp.osd_message("Blur: OFF")
    else
        mp.commandv("vf", "add", "gblur=sigma=" .. sigma)
        mp.osd_message("Blur: ON")
    end
end

local function toggle_loudnorm()
    local current_af = mp.get_property("af", "")
    local loudnorm_filter = "lavfi=[loudnorm=i=-14.0:lra=13.0:tp=-1.0]"

    if current_af == "" then
        mp.set_property("af", loudnorm_filter)
        mp.osd_message("Compressor: ON", 1.5)
    else
        mp.set_property("af", "")
        mp.osd_message("Compressor: OFF", 1.5)
    end
end

mp.add_key_binding("F2", "toggle_blur", toggle_blur)
mp.add_key_binding("F3", "toggle_loudnorm", toggle_loudnorm)
mp.add_key_binding("F4", "toggle_hflip", toggle_hflip)
